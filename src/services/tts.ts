import { execFile } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import { ProjectSummaryAudioProvider } from "../projects/types";

const execFileAsync = promisify(execFile);

export interface TtsProfile {
  provider: ProjectSummaryAudioProvider;
  voiceId: string;
  contentType: string;
  extension: string;
}

interface TtsProvider {
  readonly profile: TtsProfile;
  isAvailable(): boolean;
  synthesize(text: string, audioFile: string): Promise<void>;
}

class InternalTtsProvider implements TtsProvider {
  readonly profile: TtsProfile = {
    provider: "internal",
    voiceId: process.env.TTS_VOICE_ID?.trim() || "system-default",
    contentType: "audio/wav",
    extension: ".wav",
  };

  constructor(private readonly scriptPath: string) {}

  isAvailable() {
    return true;
  }

  async synthesize(text: string, audioFile: string) {
    const textFile = join(dirname(audioFile), `${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);

    mkdirSync(dirname(audioFile), { recursive: true });
    writeFileSync(textFile, text, "utf-8");

    try {
      await execFileAsync("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.scriptPath,
        "-TextFile",
        textFile,
        "-AudioFile",
        audioFile,
      ], {
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
      });
    } finally {
      try {
        unlinkSync(textFile);
      } catch {
        // O arquivo temporario nao precisa derrubar o fluxo.
      }
    }
  }
}

class ElevenLabsTtsProvider implements TtsProvider {
  readonly profile: TtsProfile;

  constructor() {
    this.profile = {
      provider: "elevenlabs",
      voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || process.env.TTS_VOICE_ID?.trim() || "eleven-default",
      contentType: "audio/mpeg",
      extension: ".mp3",
    };
  }

  isAvailable() {
    return Boolean(process.env.ELEVENLABS_API_KEY?.trim() && this.profile.voiceId && this.profile.voiceId !== "eleven-default");
  }

  async synthesize(text: string, audioFile: string) {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY nao configurada.");
    }

    mkdirSync(dirname(audioFile), { recursive: true });

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.profile.voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: this.profile.contentType,
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Falha ao gerar audio com ElevenLabs (${response.status}): ${body || response.statusText}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    writeFileSync(audioFile, audio);
  }
}

export class TtsService {
  private readonly internalProvider: InternalTtsProvider;
  private readonly elevenLabsProvider = new ElevenLabsTtsProvider();

  constructor(scriptPath: string) {
    this.internalProvider = new InternalTtsProvider(scriptPath);
  }

  getPreferredProfile() {
    return this.resolveProvider().profile;
  }

  async synthesize(text: string, audioFile: string) {
    const provider = this.resolveProvider();
    const normalizedAudioFile = this.replaceExtension(audioFile, provider.profile.extension);
    try {
      await provider.synthesize(text, normalizedAudioFile);

      return {
        ...provider.profile,
        audioFile: normalizedAudioFile,
      };
    } catch (error) {
      if (provider.profile.provider !== "internal" && this.shouldFallbackToInternal(error)) {
        const fallbackFile = this.replaceExtension(audioFile, this.internalProvider.profile.extension);
        await this.internalProvider.synthesize(text, fallbackFile);

        return {
          ...this.internalProvider.profile,
          audioFile: fallbackFile,
        };
      }

      throw error;
    }
  }

  private resolveProvider(): TtsProvider {
    const preferredProvider = (process.env.TTS_PROVIDER?.trim().toLowerCase() || "internal") as ProjectSummaryAudioProvider | "auto";

    if ((preferredProvider === "elevenlabs" || preferredProvider === "auto") && this.elevenLabsProvider.isAvailable()) {
      return this.elevenLabsProvider;
    }

    return this.internalProvider;
  }

  private replaceExtension(filePath: string, extension: string) {
    const currentExtension = extname(filePath);
    return currentExtension
      ? `${filePath.slice(0, -currentExtension.length)}${extension}`
      : `${filePath}${extension}`;
  }

  private shouldFallbackToInternal(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes("quota_exceeded")
      || message.includes("credits remaining")
      || message.includes("falha ao gerar audio com elevenlabs")
      || message.includes("elevenlabs");
  }
}
