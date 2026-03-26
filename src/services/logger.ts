import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CommandRecord } from "../core/types";
import { resolveNexusPath } from "../core/paths";

export class InformalLogger {
  logAccepted(command: CommandRecord) {
    this.writeLine(`novo comando na fila; ${command.source} falou com ${command.target}; tipo ${command.kind}; id ${command.id}`);
  }

  logCompleted(command: CommandRecord) {
    this.writeLine(`comando resolvido; ${command.target} tratou ${command.kind}; status completed; id ${command.id}`);
  }

  logExternalDispatch(command: CommandRecord) {
    const awaitedArtifact =
      command.external?.provider === "antigravity" ? "aguardando log de conclusao"
      : "aguardando response.json";

    this.writeLine(`job mandado pro ${command.external?.provider ?? "agente externo"}; ${awaitedArtifact}; id ${command.id}`);
  }

  logFailed(command: CommandRecord, error: string) {
    this.writeLine(`deu ruim no processamento; alvo ${command.target}; erro ${error}; id ${command.id}`);
  }

  logGuardrailViolation(command: CommandRecord, violatingFiles: string[]) {
    this.writeLine(`guardrail acionado; alvo ${command.target}; fora do escopo ${violatingFiles.join(", ")}; id ${command.id}`);
  }

  logReviewResult(command: CommandRecord, summary: string) {
    this.writeLine(`review automatico do Antigravity; ${summary}; id ${command.id}`);
  }

  logAutoCorrection(sourceCommand: CommandRecord, correctionId: string, summary: string) {
    this.writeLine(`correcao automatica aberta para o Antigravity; origem ${sourceCommand.id}; novo job ${correctionId}; motivo ${summary}`);
  }

  private writeLine(message: string) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toISOString();
    const directory = resolveNexusPath("logs");
    const filePath = join(directory, `${date}.log`);

    mkdirSync(directory, { recursive: true });
    appendFileSync(filePath, `[${time}] ${message}\n`, "utf-8");
  }

  readRecentLines(limit = 20) {
    const directory = resolveNexusPath("logs");

    try {
      const files = readdirSync(directory)
        .filter((fileName) => fileName.endsWith(".log"))
        .sort()
        .reverse();

      const lines: string[] = [];

      for (const fileName of files) {
        const content = readFileSync(join(directory, fileName), "utf-8");
        const fileLines = content.split(/\r?\n/).filter(Boolean).reverse();

        for (const line of fileLines) {
          lines.push(line);

          if (lines.length >= limit) {
            return lines.reverse();
          }
        }
      }

      return lines.reverse();
    } catch {
      return [];
    }
  }

  readRecentEntries(limit = 20) {
    return this.readRecentLines(limit).map((line, index) => {
      const match = line.match(/^\[(.+?)\]\s+(.*)$/);
      const timestamp = match?.[1] ?? new Date().toISOString();
      const message = match?.[2] ?? line;
      const lowered = message.toLowerCase();
      const agent =
        lowered.includes("antigravity") ? "antigravity"
        : lowered.includes("codex") ? "codex"
        : "system";

      return {
        id: `${timestamp}-${index}`,
        timestamp,
        agent,
        message,
      };
    });
  }
}
