import { createHash } from "node:crypto";
import { basename } from "node:path";
import { CommandRecord } from "../core/types";
import { resolveNexusPath } from "../core/paths";
import { JsonFileStore } from "../core/storage";
import { NexusProjectsService } from "../projects/service";
import { InformalLogger } from "./logger";
import { AntigravityCdpBridge, AntigravityVisibleSessionSnapshot } from "./antigravityCdp";

type MonitorJobStatus = "unseen" | "tracking" | "matched" | "attention";

interface PersistedVisibleState {
  title: string;
  url: string;
  activityLine: string | null;
  bodyTextExcerpt: string;
  editorDraft: string;
  visibleArtifacts: string[];
  visibleButtons: string[];
  isBusy: boolean;
  fingerprint: string;
}

export interface AntigravityJobMonitorState {
  jobId: string;
  projectId?: string;
  projectName?: string;
  status: MonitorJobStatus;
  score: number;
  observedAt?: string;
  promptInjectedAt?: string;
  requestFile?: string;
  logFile?: string;
  matchedSignals: string[];
  warnings: string[];
  keywordHits: string[];
  excerpt: string;
}

export interface AntigravitySessionState {
  available: boolean;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  lastError?: string;
  visible: PersistedVisibleState | null;
  jobs: AntigravityJobMonitorState[];
}

const initialState: AntigravitySessionState = {
  available: false,
  visible: null,
  jobs: [],
};

export class AntigravitySessionMonitor {
  private readonly bridge = new AntigravityCdpBridge();
  private readonly store = new JsonFileStore<AntigravitySessionState>(
    resolveNexusPath("data", "antigravity-session.json"),
    initialState,
  );

  private state = this.store.read();
  private sampleInFlight = false;

  constructor(
    private readonly logger: InformalLogger,
    private readonly projects: NexusProjectsService,
  ) {}

  async sample(commands: CommandRecord[]) {
    if (this.sampleInFlight) {
      return this.state;
    }

    this.sampleInFlight = true;

    try {
      const trackedCommands = commands
        .filter((command) => command.target === "antigravity" && command.status === "awaiting_external");
      const now = new Date().toISOString();
      const visibleSession = await this.bridge.readVisibleSession();
      const visible = this.buildVisibleState(visibleSession);
      const lastChangedAt = visible.fingerprint !== this.state.visible?.fingerprint
        ? now
        : this.state.lastChangedAt;
      const jobs = trackedCommands.map((command) => this.inspectJob(command, visibleSession, now, lastChangedAt));

      const nextState: AntigravitySessionState = {
        available: true,
        lastCheckedAt: now,
        lastChangedAt,
        lastError: undefined,
        visible,
        jobs,
      };

      this.recordTransitions(this.state.jobs, nextState.jobs);
      this.persist(nextState);
      return nextState;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao ler a sessao do Antigravity.";
      const available = await this.bridge.isAvailable().catch(() => false);
      const nextState: AntigravitySessionState = {
        ...this.state,
        available,
        lastCheckedAt: new Date().toISOString(),
        lastError: message,
        jobs: available ? [] : this.state.jobs,
      };

      this.persist(nextState);
      return nextState;
    } finally {
      this.sampleInFlight = false;
    }
  }

  getSnapshot(projectId?: string) {
    const jobs = projectId
      ? this.state.jobs.filter((job) => job.projectId === projectId)
      : this.state.jobs;

    return {
      ...this.state,
      jobs,
    };
  }

  getJobEvidence(jobId: string) {
    return this.state.jobs.find((job) => job.jobId === jobId);
  }

  getHealthSummary() {
    return {
      available: this.state.available,
      lastCheckedAt: this.state.lastCheckedAt,
      lastChangedAt: this.state.lastChangedAt,
      lastError: this.state.lastError,
      trackedJobs: this.state.jobs.map((job) => ({
        jobId: job.jobId,
        projectId: job.projectId,
        status: job.status,
        score: job.score,
        observedAt: job.observedAt,
      })),
    };
  }

  private persist(nextState: AntigravitySessionState) {
    this.state = nextState;
    this.store.write(nextState);
  }

  private buildVisibleState(snapshot: AntigravityVisibleSessionSnapshot): PersistedVisibleState {
    const visibleArtifacts = Array.from(new Set(
      Array.from(snapshot.bodyText.matchAll(/\b[\w.-]+\.(?:md|txt|html|css|js|ts|tsx|jsx|json)\b/gi))
        .map((match) => match[0])
        .slice(0, 20),
    ));
    const visibleButtons = snapshot.buttons
      .map((button) => button.text || button.ariaLabel || button.title || "")
      .filter(Boolean)
      .slice(0, 16);
    const editorDraft = snapshot.editors.find((editor) => editor.role === "textbox")?.text
      ?? snapshot.editors[0]?.text
      ?? "";
    const fingerprint = createHash("sha1")
      .update(snapshot.title)
      .update(snapshot.url)
      .update(snapshot.activityLine ?? "")
      .update(snapshot.bodyText)
      .update(editorDraft)
      .digest("hex");

    return {
      title: snapshot.title,
      url: snapshot.url,
      activityLine: snapshot.activityLine,
      bodyTextExcerpt: this.clip(snapshot.bodyText, 1800),
      editorDraft: this.clip(editorDraft, 400),
      visibleArtifacts,
      visibleButtons,
      isBusy: Boolean(snapshot.activityLine) || /(thought for|building|running|working)/i.test(snapshot.bodyText),
      fingerprint,
    };
  }

  private inspectJob(
    command: CommandRecord,
    snapshot: AntigravityVisibleSessionSnapshot,
    observedAt: string,
    lastChangedAt?: string,
  ): AntigravityJobMonitorState {
    const project = command.meta?.projectId ? this.projects.getProject(command.meta.projectId) : undefined;
    const projectName = project?.project.name;
    const requestFile = command.external?.requestFile;
    const logFile = command.external?.logFile ?? command.external?.responseFile;
    const requestFileName = requestFile ? basename(requestFile) : "";
    const logFileName = logFile ? basename(logFile) : "";
    const normalizedVisibleText = this.normalize([
      snapshot.bodyText,
      snapshot.activityLine ?? "",
      snapshot.editors.map((editor) => editor.text).join("\n"),
      snapshot.buttons.map((button) => `${button.text} ${button.ariaLabel ?? ""} ${button.title ?? ""}`).join("\n"),
      snapshot.title,
    ].join("\n"));
    const promptText = String(command.payload.text ?? "");
    const keywords = this.extractKeywords(promptText);
    const keywordHits = keywords.filter((keyword) => normalizedVisibleText.includes(this.normalize(keyword)));
    const matchedSignals: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    if (normalizedVisibleText.includes(command.id.toLowerCase())) {
      matchedSignals.push(`job ${command.id} visivel na tela`);
      score += 8;
    }

    if (requestFileName && normalizedVisibleText.includes(this.normalize(requestFileName))) {
      matchedSignals.push(`handoff ${requestFileName} apareceu na sessao`);
      score += 6;
    }

    if (logFileName && normalizedVisibleText.includes(this.normalize(logFileName))) {
      matchedSignals.push(`log ${logFileName} apareceu na sessao`);
      score += 6;
    }

    if (projectName && normalizedVisibleText.includes(this.normalize(projectName))) {
      matchedSignals.push(`projeto ${projectName} esta visivel`);
      score += 2;
    }

    if (keywordHits.length >= 3) {
      matchedSignals.push(`palavras-chave do pedido visiveis: ${keywordHits.slice(0, 5).join(", ")}`);
      score += 4;
    } else if (keywordHits.length > 0) {
      matchedSignals.push(`alguma semantica do pedido apareceu: ${keywordHits.slice(0, 3).join(", ")}`);
      score += 2;
    }

    if (snapshot.activityLine) {
      matchedSignals.push(`atividade detectada: ${snapshot.activityLine}`);
      score += 1;
    }

    const promptInjectedAt = command.meta?.telegram?.promptInjectedAt;
    const secondsSincePrompt = this.secondsBetween(promptInjectedAt, observedAt);
    const secondsSinceVisibleChange = this.secondsBetween(lastChangedAt, observedAt);
    let status: MonitorJobStatus = "unseen";

    if (score >= 8) {
      status = "matched";
    } else if (score >= 3) {
      status = "tracking";
    } else if ((secondsSincePrompt ?? 0) >= 45) {
      status = "attention";
      warnings.push("Nao encontrei sinais suficientes do job na UI apos a injecao do prompt.");
    }

    if (status !== "matched" && /(extensoes|extensions|marketplace)/i.test(snapshot.bodyText)) {
      warnings.push("A tela visivel do Antigravity parece fora do fluxo principal do job.");
    }

    if ((secondsSinceVisibleChange ?? 0) >= 120 && score < 8) {
      warnings.push("A sessao visivel esta sem mudanca relevante ha algum tempo.");
    }

    return {
      jobId: command.id,
      projectId: command.meta?.projectId,
      projectName,
      status,
      score,
      observedAt,
      promptInjectedAt,
      requestFile,
      logFile,
      matchedSignals,
      warnings,
      keywordHits,
      excerpt: this.buildExcerpt(snapshot.bodyText, [command.id, requestFileName, logFileName, ...keywordHits]),
    };
  }

  private recordTransitions(previousJobs: AntigravityJobMonitorState[], nextJobs: AntigravityJobMonitorState[]) {
    for (const nextJob of nextJobs) {
      const previous = previousJobs.find((job) => job.jobId === nextJob.jobId);

      if (previous?.status === nextJob.status) {
        continue;
      }

      const projectId = nextJob.projectId;

      if (!projectId) {
        continue;
      }

      const status =
        nextJob.status === "matched" ? "success"
        : nextJob.status === "attention" ? "warning"
        : "info";
      const summary =
        nextJob.status === "matched"
          ? "O Nexus encontrou sinais visiveis de que o Antigravity esta executando este job."
          : nextJob.status === "tracking"
            ? "O Nexus esta acompanhando sinais parciais da sessao do Antigravity para este job."
            : nextJob.status === "attention"
              ? "O monitor do Nexus nao encontrou sinais fortes do job na UI do Antigravity."
              : "O monitor ainda nao encontrou sinais visiveis do job no Antigravity.";
      const details = [...nextJob.matchedSignals, ...nextJob.warnings].slice(0, 6).join(" | ");

      try {
        this.projects.appendLog(projectId, {
          agent: "system",
          action: `antigravity.session.${nextJob.status}`,
          status,
          summary,
          details: details || undefined,
        });
      } catch {
        this.logger.readRecentEntries(1);
      }
    }
  }

  private buildExcerpt(bodyText: string, tokens: string[]) {
    const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const normalizedTokens = tokens.map((token) => this.normalize(token)).filter(Boolean);
    const relevant = lines.filter((line) => normalizedTokens.some((token) => this.normalize(line).includes(token)));
    const excerpt = (relevant.length > 0 ? relevant : lines.slice(-8)).slice(0, 10).join("\n");
    return this.clip(excerpt, 1400);
  }

  private extractKeywords(text: string) {
    const stopWords = new Set([
      "para",
      "com",
      "sem",
      "isso",
      "essa",
      "esse",
      "nexus",
      "painel",
      "projeto",
      "frontend",
      "backend",
      "precisa",
      "fazer",
      "deixar",
      "corrigir",
      "criar",
      "mais",
      "como",
      "onde",
      "quando",
      "entre",
      "sobre",
      "muito",
      "coisa",
      "coisas",
      "quero",
      "agora",
      "todo",
      "toda",
      "todas",
    ]);

    return Array.from(new Set(
      this.normalize(text)
        .split(/[^a-z0-9-]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4 && !stopWords.has(token)),
    )).slice(0, 12);
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private secondsBetween(from: string | undefined, to: string) {
    if (!from) {
      return undefined;
    }

    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);

    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      return undefined;
    }

    return Math.max(0, Math.round((toMs - fromMs) / 1000));
  }

  private clip(value: string, maxLength: number) {
    return value.length <= maxLength
      ? value
      : `${value.slice(0, maxLength - 3)}...`;
  }
}
