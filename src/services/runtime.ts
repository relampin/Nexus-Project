import { PersistentQueue } from "../core/queue";
import { CommandRequest } from "../core/types";
import { NexusProjectsService } from "../projects/service";
import {
  NexusProjectLog,
  ProjectPersonalityConfig,
  ProjectDashboardSnapshot,
  ProjectLogSummary,
  ProjectOverviewItem,
  ProjectQueueStats,
  ProjectSummaryAudioStatus,
  ProjectSummarySnapshot,
  ProjectWorkspaceSnapshot,
} from "../projects/types";
import { isInvalidatedCommand, isInvalidatedProjectLog } from "./auditHeuristics";
import { AntigravitySessionMonitor } from "./antigravitySessionMonitor";
import { InformalLogger } from "./logger";
import { Orchestrator } from "./orchestrator";
import { ProjectFilesService } from "./projectFiles";
import { ProjectSummaryService } from "./projectSummary";
import { NexusAuditService } from "./systemAudit";
import { WorkerService } from "./worker";

export class IntegrationRuntime {
  readonly queue = new PersistentQueue();
  readonly logger = new InformalLogger();
  readonly orchestrator = new Orchestrator();
  readonly projects = new NexusProjectsService();
  readonly projectFiles = new ProjectFilesService(this.projects);
  readonly antigravityMonitor = new AntigravitySessionMonitor(this.logger, this.projects);
  readonly summaries = new ProjectSummaryService();
  readonly audit = new NexusAuditService(this.queue, this.projects);
  readonly worker = new WorkerService(this.queue, this.orchestrator, this.logger, this.projects, this.antigravityMonitor);

  private interval?: NodeJS.Timeout;

  private toUiCommand(command: ReturnType<PersistentQueue["list"]>[number]) {
    return {
      id: command.id,
      source: command.source,
      target: command.target,
      kind: command.kind,
      text: String(command.payload.text ?? ""),
      payload: {
        text: String(command.payload.text ?? ""),
      },
      status: command.status,
      attempts: command.attempts,
      createdAt: command.createdAt,
      updatedAt: command.updatedAt,
      error: command.error ?? null,
      result: command.result ?? null,
      meta: command.meta ?? null,
      external: command.external ?? null,
      manualAssist:
        command.status === "awaiting_external" && command.external?.provider === "antigravity"
          ? {
              required: true,
              provider: "antigravity",
              requestFile: command.external.requestFile,
              responseFile: command.external.responseFile,
              hint: "Telegram aciona o job e o Nexus injeta o prompt no IDE do Antigravity via CDP. O fechamento acontece pelo arquivo de log.",
            }
          : null,
      monitor:
        command.external?.provider === "antigravity"
          ? this.antigravityMonitor.getJobEvidence(command.id) ?? null
          : null,
    };
  }

  async acceptCommand(command: CommandRequest) {
    const projectId = command.meta?.projectId ?? this.projects.getActiveProject()?.project.id;
    const record = this.queue.enqueue({
      ...command,
      meta: {
        ...command.meta,
        projectId,
      },
    });
    this.logger.logAccepted(record);

    if (projectId) {
      this.projects.appendLog(projectId, {
        agent: command.source,
        action: `command.${command.kind}.accepted`,
        status: "info",
        summary: `${command.source} abriu um job para ${command.target}.`,
        details: String(command.payload.text ?? ""),
      });
    }

    return record;
  }

  markTelegramRelaySent(id: string, targetChatId: number) {
    const updated = this.queue.update(id, (command) => ({
      ...command,
      meta: {
        ...command.meta,
        telegram: {
          ...command.meta?.telegram,
          targetChatId,
          relaySentAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date().toISOString(),
    }));

    this.appendCommandProjectLog(updated, {
      agent: "system",
      action: "telegram.relay",
      status: "info",
      summary: `Job enviado ao chat ${targetChatId}.`,
    });

    return updated;
  }

  markTelegramPromptInjected(id: string) {
    const updated = this.queue.update(id, (command) => ({
      ...command,
      meta: {
        ...command.meta,
        telegram: {
          ...command.meta?.telegram,
          promptInjectedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date().toISOString(),
    }));

    this.appendCommandProjectLog(updated, {
      agent: "system",
      action: "antigravity.prompt_injected",
      status: "info",
      summary: "Prompt injetado no Antigravity via CDP.",
    });

    return updated;
  }

  markTelegramStatusNotified(id: string) {
    const updated = this.queue.update(id, (command) => ({
      ...command,
      meta: {
        ...command.meta,
        telegram: {
          ...command.meta?.telegram,
          statusNotifiedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date().toISOString(),
    }));

    this.appendCommandProjectLog(updated, {
      agent: "system",
      action: "telegram.status_notified",
      status: "info",
      summary: "Status final notificado no Telegram.",
    });

    return updated;
  }

  markGuardrailAlerted(id: string, violatingFiles: string[]) {
    const updated = this.queue.update(id, (command) => ({
      ...command,
      meta: {
        ...command.meta,
        guardrail: {
          alertInjectedAt: new Date().toISOString(),
          violatingFiles,
        },
      },
      updatedAt: new Date().toISOString(),
    }));

    this.appendCommandProjectLog(updated, {
      agent: "system",
      action: "antigravity.guardrail_alert",
      status: "warning",
      summary: "Guardrail do Antigravity acionado.",
      details: violatingFiles.join(", "),
    });

    return updated;
  }

  completeExternalTelegramCommand(id: string, agent: "antigravity" | "codex", summary: string, details?: string) {
    const completed = this.queue.markCompleted(id, {
      message: summary,
      data: {
        provider: agent,
        response: {
          status: "ok",
          summary,
          details: details ?? summary,
          finishedAt: new Date().toISOString(),
        },
      },
    });

    if (completed) {
      this.logger.logCompleted(completed);
      this.appendCommandProjectLog(completed, {
        agent,
        action: `command.${completed.kind}.completed`,
        status: "success",
        summary,
        details,
      });
    }

    return completed;
  }

  failExternalTelegramCommand(id: string, error: string) {
    const failed = this.queue.markFailed(id, error);

    if (failed) {
      this.logger.logFailed(failed, error);
      this.appendCommandProjectLog(failed, {
        agent: failed.target,
        action: `command.${failed.kind}.failed`,
        status: "error",
        summary: error,
      });
    }

    return failed;
  }

  listPendingTelegramDelegations() {
    return this.queue
      .list()
      .filter((command) => command.status === "awaiting_external" && command.external?.channel === "telegram");
  }

  getUiSnapshot() {
    const audit = this.getAuditReport();
    const activeProject = this.getActiveProjectSnapshot();
    const activeProjectId = activeProject?.project.id;

    return {
      service: "nexus-portatil",
      now: new Date().toISOString(),
      stats: this.getVisibleQueueStats(),
      audit: this.audit.getLatestSummary() ?? {
        status: audit.status,
        generatedAt: audit.generatedAt,
        findings: audit.findings,
        highlights: audit.highlights,
        invalidatedCommands: audit.invalidatedCommands,
      },
      projects: this.getProjectsOverview(),
      activeProject,
      activeProjectId,
      agents: [
        { id: "codex", label: "Codex", executor: "openclaw", mode: "automatic" },
        { id: "antigravity", label: "Antigravity", executor: "telegram+cdp", mode: "delegated" },
      ],
      kinds: ["task", "note", "ping", "list_pending", "status_summary"],
      commands: activeProject?.commands ?? this.queue.list().slice(0, 20).map((command) => this.toUiCommand(command)),
      activity: this.logger.readRecentEntries(20),
      projectActivity: activeProject?.logs ?? [],
      antigravitySession: this.antigravityMonitor.getSnapshot(activeProjectId),
      manualAssist: {
        codex: [],
        antigravity:
          this.queue
            .list()
            .filter((command) =>
              command.status === "awaiting_external"
              && command.external?.provider === "antigravity"
              && (!activeProjectId || command.meta?.projectId === activeProjectId))
            .map((command) => this.toUiCommand(command)),
      },
    };
  }

  getUiCommand(id: string) {
    const command = this.queue.getById(id);
    return command ? this.toUiCommand(command) : undefined;
  }

  listUiCommands(status?: string, limit = 50) {
    return this.queue
      .list()
      .filter((command) => !status || command.status === status)
      .slice(0, limit)
      .map((command) => this.toUiCommand(command));
  }

  getProjectsOverview() {
    const activeProjectId = this.projects.getActiveProject()?.project.id;
    const items: ProjectOverviewItem[] = this.projects.listWorkspaces().map((workspace) => ({
      project: workspace.project,
      settings: workspace.settings,
      personality: this.resolveProjectPersonality(workspace.settings),
      isActive: workspace.project.id === activeProjectId,
      dashboard: this.buildProjectDashboard(workspace.project.id),
    }));

    return {
      activeProjectId,
      items,
    };
  }

  getActiveProjectSnapshot() {
    const active = this.projects.getActiveProject();
    return active ? this.getProjectSnapshot(active.project.id) : undefined;
  }

  getProjectSnapshot(projectId: string): ProjectWorkspaceSnapshot | undefined {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      return undefined;
    }

    const summarySnapshot = this.getProjectSummary(projectId);

    return {
      project: workspace.project,
      settings: workspace.settings,
      personality: summarySnapshot.personality,
      dashboard: this.buildProjectDashboard(projectId),
      tasks: this.projects.listTasks(projectId),
      milestones: this.projects.listMilestones(projectId),
      agenda: this.projects.buildAgenda(projectId),
      logs: this.projects.listLogs(projectId, 30),
      commands: this.getProjectCommands(projectId, 30),
      report: this.getProjectLogReport(projectId),
      files: this.projectFiles.getOverview(projectId),
      summary: summarySnapshot.summary,
      narrator: summarySnapshot.narrator,
    };
  }

  getProjectFilesOverview(projectId: string, force = false) {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    return this.projectFiles.getOverview(projectId, force);
  }

  getProjectFileContent(projectId: string, relativePath: string) {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    return this.projectFiles.readFile(projectId, relativePath);
  }

  listProjectLogs(projectId: string, limit = 100) {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    return this.projects.listLogs(projectId, limit);
  }

  getProjectLogReport(projectId: string): ProjectLogSummary {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    return this.buildLogSummary(this.getFilteredProjectLogs(projectId, 100));
  }

  getProjectSummary(projectId: string): ProjectSummarySnapshot {
    return this.summaries.buildSummary(this.buildProjectSummarySource(projectId));
  }

  async ensureProjectSummaryAudio(projectId: string) {
    return this.summaries.ensureNarration(this.buildProjectSummarySource(projectId));
  }

  setProjectSummaryPlaybackStatus(projectId: string, status: ProjectSummaryAudioStatus) {
    return this.summaries.setPlaybackStatus(this.buildProjectSummarySource(projectId), status);
  }

  async resolveProjectSummaryAudioAsset(projectId: string) {
    return this.summaries.resolveAudioAsset(this.buildProjectSummarySource(projectId));
  }

  getAuditReport(force = false) {
    const latest = this.audit.getLatestReport();
    const latestAge = latest ? Date.now() - Date.parse(latest.generatedAt) : Number.POSITIVE_INFINITY;

    if (!force && latest && latestAge < 15000) {
      return latest;
    }

    return this.audit.run({
      getProjectSnapshot: (projectId) => this.getProjectSnapshot(projectId),
      getProjectSummary: (projectId) => this.getProjectSummary(projectId),
    });
  }

  async sampleAntigravitySession(projectId?: string) {
    await this.antigravityMonitor.sample(this.queue.list());
    return this.antigravityMonitor.getSnapshot(projectId);
  }

  start() {
    const intervalMs = Number(process.env.PROCESSING_INTERVAL_MS ?? 5000);
    this.getAuditReport(true);
    this.interval = setInterval(() => {
      void this.worker.processPending();
      void this.worker.collectExternalResults();
      void this.sampleAntigravitySession();
      this.getAuditReport();
    }, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private getProjectCommands(projectId: string, limit = 20) {
    return this.getEffectiveProjectCommands(projectId)
      .slice(0, limit)
      .map((command) => this.toUiCommand(command));
  }

  private getVisibleQueueStats() {
    const commands = this.queue.list().filter((command) => !isInvalidatedCommand(command));

    return {
      total: commands.length,
      pending: commands.filter((item) => item.status === "pending").length,
      processing: commands.filter((item) => item.status === "processing").length,
      awaitingExternal: commands.filter((item) => item.status === "awaiting_external").length,
      completed: commands.filter((item) => item.status === "completed").length,
      failed: commands.filter((item) => item.status === "failed").length,
    };
  }

  private getProjectCommandRecords(projectId: string) {
    return this.queue.list().filter((command) => command.meta?.projectId === projectId);
  }

  private getEffectiveProjectCommands(projectId: string) {
    return this.getProjectCommandRecords(projectId)
      .filter((command) => !isInvalidatedCommand(command));
  }

  private getProjectQueueStats(projectId: string): ProjectQueueStats {
    const commands = this.getEffectiveProjectCommands(projectId);

    return {
      total: commands.length,
      pending: commands.filter((item) => item.status === "pending").length,
      processing: commands.filter((item) => item.status === "processing").length,
      awaitingExternal: commands.filter((item) => item.status === "awaiting_external").length,
      completed: commands.filter((item) => item.status === "completed").length,
      failed: commands.filter((item) => item.status === "failed").length,
    };
  }

  private getFilteredProjectLogs(projectId: string, limit = 100) {
    return this.projects
      .listLogs(projectId, limit)
      .filter((entry) => !isInvalidatedProjectLog(entry));
  }

  private buildLogSummary(logs: NexusProjectLog[]): ProjectLogSummary {
    const agentSummary = {
      codex: logs.filter((entry) => entry.agent === "codex").length,
      antigravity: logs.filter((entry) => entry.agent === "antigravity").length,
      system: logs.filter((entry) => entry.agent === "system").length,
    };
    const latestEntries = logs.slice(0, 5).map((entry) => `${entry.agent}: ${entry.summary}`);

    return {
      total: logs.length,
      agentSummary,
      latestEntries,
      autoNarrative:
        latestEntries.length > 0
          ? `Atividade recente: ${latestEntries.join(" | ")}`
          : "Ainda nao ha atividade suficiente para gerar um resumo automatico.",
    };
  }

  private buildProjectDashboard(projectId: string): ProjectDashboardSnapshot {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    const taskStats = this.projects.getTaskStats(projectId);
    const milestoneStats = this.projects.getMilestoneStats(projectId);
    const queueStats = this.getProjectQueueStats(projectId);
    const agenda = this.projects.buildAgenda(projectId);
    const logs = this.buildLogSummary(this.getFilteredProjectLogs(projectId, 100));

    const tasksPct = taskStats.total > 0
      ? Math.round((taskStats.completed / taskStats.total) * 100)
      : 0;
    const milestonesPct = milestoneStats.total > 0
      ? Math.round((milestoneStats.completed / milestoneStats.total) * 100)
      : 0;
    const commandsPct = queueStats.total > 0
      ? Math.round((queueStats.completed / queueStats.total) * 100)
      : 0;
    const overallPct = workspace.project.state === "completed"
      ? 100
      : Math.round((tasksPct * 0.45) + (milestonesPct * 0.35) + (commandsPct * 0.2));

    const experiencePoints = (taskStats.completed * 80)
      + (milestoneStats.completed * 160)
      + (queueStats.completed * 25)
      + (logs.agentSummary.codex * 6)
      + (logs.agentSummary.antigravity * 6);
    const level = Math.max(1, Math.floor(experiencePoints / 250) + 1);
    const currentLevelFloor = (level - 1) * 250;
    const nextLevelAt = level * 250;
    const levelProgressPct = Math.min(100, Math.max(0, Math.round(((experiencePoints - currentLevelFloor) / 250) * 100)));
    const health = queueStats.failed > 0 || taskStats.overdue > 0
      ? "attention"
      : overallPct >= 70
        ? "strong"
        : "steady";
    const nextFocus = agenda.overdue[0]?.title
      ?? agenda.today[0]?.title
      ?? agenda.upcoming[0]?.title
      ?? workspace.milestones.find((item) => item.status !== "completed")?.title
      ?? "Sem bloqueios imediatos.";

    return {
      progress: {
        overallPct,
        tasksPct,
        milestonesPct,
        commandsPct,
      },
      gamification: {
        level,
        experiencePoints,
        currentLevelFloor,
        nextLevelAt,
        levelProgressPct,
      },
      status: {
        projectState: workspace.project.state,
        health,
        overdueTasks: taskStats.overdue,
        pendingReviews: queueStats.awaitingExternal,
        nextFocus,
      },
      tasks: taskStats,
      milestones: milestoneStats,
      queue: queueStats,
      agendaCounts: {
        overdue: agenda.overdue.length,
        today: agenda.today.length,
        upcoming: agenda.upcoming.length,
        withoutDueDate: agenda.withoutDueDate.length,
        completed: agenda.completed.length,
      },
      logs,
    };
  }

  private buildProjectSummarySource(projectId: string) {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    return {
      project: workspace.project,
      personality: this.resolveProjectPersonality(workspace.settings),
      tasks: this.projects.listTasks(projectId),
      milestones: this.projects.listMilestones(projectId),
      logs: this.getFilteredProjectLogs(projectId, 40),
      agenda: this.projects.buildAgenda(projectId),
      dashboard: this.buildProjectDashboard(projectId),
      report: this.getProjectLogReport(projectId),
      commands: this.getEffectiveProjectCommands(projectId)
        .slice(0, 20)
        .map((command) => ({
          id: command.id,
          target: command.target,
          kind: command.kind,
          status: command.status,
          updatedAt: command.updatedAt,
        })),
    };
  }

  private resolveProjectPersonality(settings?: { personalityMode?: string; personalityIntensity?: string }): ProjectPersonalityConfig {
    return {
      mode: settings?.personalityMode === "neutral" ? "neutral" : "sarcastic",
      intensity: settings?.personalityIntensity === "low" || settings?.personalityIntensity === "high"
        ? settings.personalityIntensity
        : "medium",
    };
  }

  private appendCommandProjectLog(
    command: { meta?: { projectId?: string } } | undefined,
    entry: {
      agent: "codex" | "antigravity" | "system";
      action: string;
      status: "info" | "success" | "warning" | "error";
      summary: string;
      details?: string;
    },
  ) {
    const projectId = command?.meta?.projectId;

    if (!projectId) {
      return;
    }

    try {
      this.projects.appendLog(projectId, entry);
    } catch {
      // Se o projeto sumiu no meio do fluxo, mantemos o logger global sem derrubar o runtime.
    }
  }
}
