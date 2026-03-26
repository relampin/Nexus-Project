import { CommandRecord } from "../core/types";
import {
  NexusMilestone,
  NexusProject,
  NexusProjectLog,
  NexusTask,
  ProjectAgendaOperationalSnapshot,
  ProjectAgendaSnapshot,
  ProjectDashboardSnapshot,
  ProjectDigestSnapshot,
  ProjectGitSnapshot,
  ProjectProfileDefinition,
  ProjectRadarAction,
  ProjectRadarSnapshot,
  ProjectTaskBoardLane,
  ProjectTaskBoardSnapshot,
  ProjectTaskExecutionSnapshot,
  ProjectTimelineEvent,
  ProjectValidationSnapshot,
} from "../projects/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ProjectIntelligenceService {
  buildAgendaOperational(tasks: NexusTask[], commands: CommandRecord[]): ProjectAgendaOperationalSnapshot {
    const activeTasks = tasks.filter((task) => task.status !== "completed");
    const linkedByTask = this.buildLatestTaskCommandMap(commands);
    const today = this.startOfDay(new Date());
    const weekLimit = new Date(today.getTime() + (7 * MS_PER_DAY));

    const immediate = this.uniqueTasks([
      ...activeTasks.filter((task) => task.status === "in_progress"),
      ...activeTasks.filter((task) => this.isOverdue(task, today)),
      ...activeTasks.filter((task) => task.priority === "critical"),
      ...activeTasks.filter((task) => linkedByTask.get(task.id)?.status === "failed"),
    ]).slice(0, 5);

    const blocked = this.uniqueTasks(
      activeTasks.filter((task) => {
        const command = linkedByTask.get(task.id);
        return command?.status === "awaiting_external" || command?.status === "failed";
      }),
    ).slice(0, 5);

    const thisWeek = activeTasks
      .filter((task) => {
        const due = this.parseDate(task.dueDate);
        return Boolean(due && due >= today && due <= weekLimit);
      })
      .sort((left, right) => this.compareTasks(left, right))
      .slice(0, 6);

    const atRisk = this.uniqueTasks([
      ...activeTasks.filter((task) => this.isOverdue(task, today)),
      ...activeTasks.filter((task) => task.priority === "critical" && task.status !== "completed"),
      ...blocked,
    ]).slice(0, 5);

    const nextUp = activeTasks
      .filter((task) => !immediate.some((candidate) => candidate.id === task.id) && !blocked.some((candidate) => candidate.id === task.id))
      .sort((left, right) => this.compareTasks(left, right))
      .slice(0, 6);

    const recentlyCompleted = tasks
      .filter((task) => task.status === "completed")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5);

    return {
      immediate,
      thisWeek,
      atRisk,
      blocked,
      nextUp,
      recentlyCompleted,
    };
  }

  buildTaskBoard(tasks: NexusTask[], commands: CommandRecord[], agendaOperational: ProjectAgendaOperationalSnapshot): ProjectTaskBoardSnapshot {
    const linkedByTask = this.buildLatestTaskCommandMap(commands);
    const immediateIds = new Set(agendaOperational.immediate.map((task) => task.id));
    const blockedIds = new Set(agendaOperational.blocked.map((task) => task.id));

    const toTaskSnapshot = (task: NexusTask): ProjectTaskExecutionSnapshot => {
      const linkedCommand = linkedByTask.get(task.id);
      return {
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        linkedCommandId: linkedCommand?.id,
        linkedCommandStatus: linkedCommand?.status,
        linkedCommandTarget: linkedCommand?.target,
        linkedCommandUpdatedAt: linkedCommand?.updatedAt,
        linkedResultSummary: this.getCommandResultSummary(linkedCommand),
      };
    };

    const lanes: ProjectTaskBoardLane[] = [
      {
        id: "immediate",
        label: "Fazer agora",
        count: agendaOperational.immediate.length,
        items: agendaOperational.immediate.map(toTaskSnapshot),
      },
      {
        id: "in_progress",
        label: "Em andamento",
        count: tasks.filter((task) => task.status === "in_progress").length,
        items: tasks.filter((task) => task.status === "in_progress").slice(0, 6).map(toTaskSnapshot),
      },
      {
        id: "blocked",
        label: "Bloqueadas ou em revisão",
        count: agendaOperational.blocked.length,
        items: agendaOperational.blocked.map(toTaskSnapshot),
      },
      {
        id: "backlog",
        label: "Próximas da fila",
        count: tasks.filter((task) => task.status === "pending" && !immediateIds.has(task.id) && !blockedIds.has(task.id)).length,
        items: agendaOperational.nextUp.map(toTaskSnapshot),
      },
    ];

    return { lanes };
  }

  buildRadar(
    project: NexusProject,
    profile: ProjectProfileDefinition,
    dashboard: ProjectDashboardSnapshot,
    tasks: NexusTask[],
    milestones: NexusMilestone[],
    logs: NexusProjectLog[],
    commands: CommandRecord[],
    agendaOperational: ProjectAgendaOperationalSnapshot,
  ): ProjectRadarSnapshot {
    const failedCommands = commands.filter((command) => command.status === "failed");
    const waitingCommands = commands.filter((command) => command.status === "awaiting_external");
    const latestProblemLog = logs.find((entry) => entry.status === "error" || entry.status === "warning");
    const activeMilestone = milestones.find((milestone) => milestone.status !== "completed");
    const nextTask = agendaOperational.immediate[0] ?? agendaOperational.nextUp[0];

    let risk = "Sem risco crítico no radar. O projeto está estável o suficiente para seguir executando.";
    if (failedCommands.length > 0) {
      risk = `${failedCommands.length} job(ns) falharam recentemente. Vale revisar a causa raiz antes de empilhar mais entrega.`;
    } else if (dashboard.tasks.overdue > 0) {
      risk = `Existem ${dashboard.tasks.overdue} tarefa(s) atrasada(s), então a chance de o plano perder tração subiu.`;
    } else if (latestProblemLog?.summary) {
      risk = latestProblemLog.summary;
    }

    let blocker = "Nenhum bloqueio explícito agora. O caminho principal está relativamente livre.";
    if (agendaOperational.blocked[0]) {
      blocker = `A tarefa "${agendaOperational.blocked[0].title}" está travada por dependência ou revisão pendente.`;
    } else if (waitingCommands[0]) {
      blocker = `Ainda há trabalho aguardando retorno de ${waitingCommands[0].target}.`;
    } else if (tasks.find((task) => task.status === "in_progress")) {
      blocker = `O principal ponto aberto agora é fechar "${tasks.find((task) => task.status === "in_progress")?.title}".`;
    }

    const nextDelivery = nextTask?.title
      ?? activeMilestone?.title
      ?? dashboard.status.nextFocus
      ?? "Puxar a próxima entrega prioritária do backlog.";

    const actions: ProjectRadarAction[] = [
      {
        id: "attack_next_delivery",
        label: "Atacar próxima entrega",
        description: "Abre um job para mover a entrega mais útil do momento.",
        target: "codex",
        variant: "primary",
        commandText: this.buildActionPrompt(project, profile, "attack_next_delivery", nextDelivery, risk, blocker),
      },
      {
        id: "resolve_blocker",
        label: "Resolver bloqueio atual",
        description: "Pede uma ação focada para destravar a frente travada.",
        target: "codex",
        variant: agendaOperational.blocked.length > 0 ? "warning" : "secondary",
        commandText: this.buildActionPrompt(project, profile, "resolve_blocker", blocker, risk, blocker),
      },
      {
        id: "review_risk",
        label: "Revisar risco principal",
        description: "Audita o maior risco operacional e propõe correção objetiva.",
        target: "codex",
        variant: failedCommands.length > 0 || dashboard.tasks.overdue > 0 ? "warning" : "secondary",
        commandText: this.buildActionPrompt(project, profile, "review_risk", risk, risk, blocker),
      },
    ];

    const checkpoints = [
      ...(agendaOperational.immediate.slice(0, 2).map((task) => `Tarefa: ${task.title}`)),
      ...(milestones.filter((milestone) => milestone.status !== "completed").slice(0, 2).map((milestone) => `Marco: ${milestone.title}`)),
    ].slice(0, 4);

    return {
      headline: `Radar estratégico de ${project.name}`,
      risk,
      blocker,
      nextDelivery,
      checkpoints,
      actions,
    };
  }

  buildTimeline(
    tasks: NexusTask[],
    milestones: NexusMilestone[],
    logs: NexusProjectLog[],
    commands: CommandRecord[],
    validation?: ProjectValidationSnapshot,
    git?: ProjectGitSnapshot,
  ): ProjectTimelineEvent[] {
    const events: ProjectTimelineEvent[] = [];

    for (const task of tasks) {
      events.push({
        id: `task-${task.id}`,
        timestamp: task.updatedAt,
        kind: "task",
        title: `Tarefa ${task.status === "completed" ? "concluída" : task.status === "in_progress" ? "em andamento" : "atualizada"}: ${task.title}`,
        detail: task.description ?? "Sem detalhe adicional.",
        status: task.status === "completed" ? "success" : task.status === "in_progress" ? "info" : "warning",
        taskId: task.id,
      });
    }

    for (const milestone of milestones) {
      events.push({
        id: `milestone-${milestone.id}`,
        timestamp: milestone.updatedAt,
        kind: "milestone",
        title: `Marco ${milestone.status === "completed" ? "concluído" : milestone.status === "in_progress" ? "em andamento" : "atualizado"}: ${milestone.title}`,
        detail: milestone.description ?? "Sem detalhe adicional.",
        status: milestone.status === "completed" ? "success" : milestone.status === "in_progress" ? "info" : "warning",
        milestoneId: milestone.id,
      });
    }

    for (const entry of logs) {
      events.push({
        id: `log-${entry.id}`,
        timestamp: entry.timestamp,
        kind: "log",
        title: entry.summary,
        detail: entry.details ?? entry.action,
        status: entry.status,
        agent: entry.agent,
      });
    }

    for (const command of commands) {
      events.push({
        id: `command-${command.id}`,
        timestamp: command.updatedAt,
        kind: "command",
        title: `${command.source} -> ${command.target} (${command.kind})`,
        detail: this.getCommandResultSummary(command) || String(command.payload.text ?? "").slice(0, 220) || "Job sem detalhe adicional.",
        status: command.status === "completed"
          ? "success"
          : command.status === "failed"
            ? "error"
            : command.status === "awaiting_external"
              ? "warning"
              : "info",
        agent: command.target,
        commandId: command.id,
        taskId: command.meta?.taskId,
      });
    }

    if (validation?.lastRunAt) {
      events.push({
        id: `validation-${validation.lastRunAt}`,
        timestamp: validation.lastRunAt,
        kind: "validation",
        title: "Validação automática executada",
        detail: validation.summary,
        status: validation.status === "failed" ? "error" : validation.status === "warning" ? "warning" : "success",
      });
    }

    if (git?.recentCommits?.[0]) {
      events.push({
        id: `git-${git.recentCommits[0].hash}`,
        timestamp: git.recentCommits[0].timestamp,
        kind: "git",
        title: `Commit recente: ${git.recentCommits[0].summary}`,
        detail: `${git.recentCommits[0].author} • ${git.branch ?? "sem branch"}`,
        status: git.clean ? "info" : "warning",
      });
    }

    return events
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 40);
  }

  buildDigest(
    project: NexusProject,
    dashboard: ProjectDashboardSnapshot,
    agendaOperational: ProjectAgendaOperationalSnapshot,
    logs: NexusProjectLog[],
    commands: CommandRecord[],
  ): ProjectDigestSnapshot {
    const todayKey = new Date().toISOString().slice(0, 10);
    const wins = [
      ...agendaOperational.recentlyCompleted.slice(0, 3).map((task) => `Tarefa concluída: ${task.title}`),
      ...commands.filter((command) => command.status === "completed" && command.updatedAt.startsWith(todayKey)).slice(0, 2)
        .map((command) => `Job fechado: ${command.source} -> ${command.target} (${command.kind})`),
    ].slice(0, 4);
    const risks = [
      dashboard.tasks.overdue > 0 ? `${dashboard.tasks.overdue} tarefa(s) atrasada(s) ainda pesam no plano.` : "",
      dashboard.queue.failed > 0 ? `${dashboard.queue.failed} falha(s) de job continuam no histórico visível.` : "",
      ...logs.filter((entry) => entry.status === "warning" || entry.status === "error").slice(0, 2).map((entry) => entry.summary),
    ].filter(Boolean).slice(0, 3);
    const nextSteps = [
      agendaOperational.immediate[0]?.title ? `Atacar agora: ${agendaOperational.immediate[0].title}` : "",
      agendaOperational.nextUp[0]?.title ? `Depois disso: ${agendaOperational.nextUp[0].title}` : "",
      dashboard.status.nextFocus ? `Foco do painel: ${dashboard.status.nextFocus}` : "",
    ].filter(Boolean).slice(0, 3);

    return {
      generatedAt: new Date().toISOString(),
      title: `O que mudou hoje em ${project.name}`,
      summary: this.buildDigestSummary(project.name, wins.length, risks.length, nextSteps[0] ?? dashboard.status.nextFocus),
      wins,
      risks,
      nextSteps,
    };
  }

  private buildActionPrompt(
    project: NexusProject,
    profile: ProjectProfileDefinition,
    actionId: string,
    focusText: string,
    risk: string,
    blocker: string,
  ) {
    const actionLabel = actionId === "attack_next_delivery"
      ? "Atacar a próxima entrega"
      : actionId === "resolve_blocker"
        ? "Resolver o bloqueio atual"
        : "Revisar o risco principal";

    return [
      `Quero que você execute a ação estratégica "${actionLabel}" para o projeto ${project.name}.`,
      "",
      `Contexto curto do projeto: ${project.description || "Sem descrição registrada."}`,
      `Perfil estimado: ${profile.label}.`,
      `Foco desta ação: ${focusText}.`,
      `Risco principal atual: ${risk}.`,
      `Bloqueio atual: ${blocker}.`,
      "",
      "O que fazer:",
      "- Analise o estado atual do projeto no Nexus.",
      "- Execute a parte de backend, lógica, integração, dados, estrutura e validação que fizer sentido.",
      "- Se houver frente visual ou UX, delegue ao Antigravity pelo fluxo normal do Nexus.",
      "- Preserve o que já funciona e deixe claro o que foi feito, o que foi delegado e o que ainda falta validar.",
    ].join("\n");
  }

  private buildDigestSummary(projectName: string, wins: number, risks: number, nextStep: string) {
    if (wins > 0 && risks === 0) {
      return `${projectName} fechou o dia em bom ritmo: teve entrega concreta e o radar está limpo o suficiente para puxar ${nextStep}.`;
    }

    if (wins > 0) {
      return `${projectName} avançou hoje, mas ainda tem ruído operacional para tratar antes de empilhar mais escopo. Próxima puxada: ${nextStep}.`;
    }

    return `${projectName} não consolidou grandes vitórias hoje, então o melhor movimento agora é recuperar tração por ${nextStep}.`;
  }

  private buildLatestTaskCommandMap(commands: CommandRecord[]) {
    const map = new Map<string, CommandRecord>();

    for (const command of commands
      .filter((item) => item.meta?.taskId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
      const taskId = command.meta?.taskId;

      if (!taskId || map.has(taskId)) {
        continue;
      }

      map.set(taskId, command);
    }

    return map;
  }

  private getCommandResultSummary(command?: CommandRecord) {
    if (!command?.result) {
      return command?.error ?? "";
    }

    const candidate = command.result as { message?: string; response?: { summary?: string }; data?: { response?: { summary?: string } } };
    return candidate.message
      ?? candidate.response?.summary
      ?? candidate.data?.response?.summary
      ?? command.error
      ?? "";
  }

  private uniqueTasks(tasks: NexusTask[]) {
    const seen = new Set<string>();
    return tasks.filter((task) => {
      if (seen.has(task.id)) {
        return false;
      }

      seen.add(task.id);
      return true;
    });
  }

  private compareTasks(left: NexusTask, right: NexusTask) {
    const priorityOrder = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    } as const;
    const priorityGap = priorityOrder[left.priority] - priorityOrder[right.priority];

    if (priorityGap !== 0) {
      return priorityGap;
    }

    const leftDue = this.parseDate(left.dueDate);
    const rightDue = this.parseDate(right.dueDate);

    if (leftDue && rightDue) {
      return leftDue.getTime() - rightDue.getTime();
    }

    if (leftDue) {
      return -1;
    }

    if (rightDue) {
      return 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  }

  private isOverdue(task: NexusTask, today: Date) {
    const due = this.parseDate(task.dueDate);
    return Boolean(due && due < today && task.status !== "completed");
  }

  private parseDate(value?: string) {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : this.startOfDay(parsed);
  }

  private startOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
}
