import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { getNexusHome, getTargetProjectRoot, resolveNexusPath } from "../core/paths";
import { JsonFileStore } from "../core/storage";
import { inspectWorkspaceSeed, isDiscoveryManagedText } from "./discovery";
import {
  NexusMilestone,
  NexusProject,
  NexusProjectLog,
  NexusProjectsState,
  NexusProjectSettings,
  NexusProjectWorkspace,
  NexusTask,
  ProjectAgendaSnapshot,
  ProjectMilestoneStats,
  ProjectTaskStats,
} from "./types";

export class NexusProjectsService {
  private readonly store = new JsonFileStore<NexusProjectsState>(resolveNexusPath("data", "projects.json"), this.buildInitialState());

  constructor() {
    this.repairPersistedText();
  }

  listProjects() {
    return this.store.read().workspaces.map((workspace) => workspace.project);
  }

  listWorkspaces() {
    return this.store.read().workspaces;
  }

  getProject(projectId: string) {
    return this.store.read().workspaces.find((workspace) => workspace.project.id === projectId);
  }

  getActiveProject() {
    const state = this.store.read();
    const active = state.workspaces.find((workspace) => workspace.project.id === state.activeProjectId);
    return active ?? state.workspaces[0];
  }

  getProjectRoot(projectId?: string) {
    const workspace = projectId
      ? this.getProject(projectId)
      : this.getActiveProject();

    const configuredRoot = this.normalizeProjectRootInput(workspace?.settings.projectRoot);

    if (!configuredRoot) {
      return getTargetProjectRoot();
    }

    return isAbsolute(configuredRoot)
      ? configuredRoot
      : resolve(getNexusHome(), configuredRoot);
  }

  createProject(input: {
    name?: string;
    description?: string;
    state?: NexusProject["state"];
    settings?: NexusProjectSettings;
  }) {
    const state = this.store.read();
    const now = new Date().toISOString();
    const configuredRoot = this.normalizeProjectRootInput(input.settings?.projectRoot);
    const normalizedRoot = configuredRoot
      ? isAbsolute(configuredRoot)
        ? configuredRoot
        : resolve(getNexusHome(), configuredRoot)
      : undefined;
    const projectId = uuidv4();
    const discovered = normalizedRoot
      ? inspectWorkspaceSeed(projectId, normalizedRoot, input.name?.trim())
      : undefined;
    const workspace: NexusProjectWorkspace = {
      project: {
        id: projectId,
        name: input.name?.trim() || discovered?.projectName || "Projeto novo",
        description: input.description?.trim() || discovered?.description || "",
        createdAt: now,
        state: input.state ?? "active",
      },
      settings: {
        projectRoot: normalizedRoot ?? input.settings?.projectRoot?.trim(),
        colorToken: input.settings?.colorToken?.trim() || discovered?.settings.colorToken,
        icon: input.settings?.icon?.trim() || discovered?.settings.icon,
        personalityMode: input.settings?.personalityMode,
        personalityIntensity: input.settings?.personalityIntensity,
        stackHint: input.settings?.stackHint?.trim() || discovered?.settings.stackHint,
        lastIndexedAt: input.settings?.lastIndexedAt?.trim() || discovered?.settings.lastIndexedAt,
      },
      tasks: discovered?.tasks ?? [],
      milestones: discovered?.milestones ?? [],
      logs: discovered?.logs ?? [],
    };

    state.workspaces.unshift(workspace);
    state.activeProjectId = workspace.project.id;
    this.store.write(state);
    this.appendLog(workspace.project.id, {
      agent: "system",
      action: "project.create",
      status: "success",
      summary: `Projeto ${workspace.project.name} criado no Nexus.`,
    });
    return workspace;
  }

  updateProject(projectId: string, input: {
    name?: string;
    description?: string;
    state?: NexusProject["state"];
    settings?: NexusProjectSettings;
  }) {
    const state = this.store.read();
    const workspace = state.workspaces.find((item) => item.project.id === projectId);

    if (!workspace) {
      return undefined;
    }

    workspace.project = {
      ...workspace.project,
      name: input.name?.trim() ?? workspace.project.name,
      description: input.description?.trim() ?? workspace.project.description,
      state: input.state ?? workspace.project.state,
    };
    workspace.settings = {
      ...workspace.settings,
      ...(input.settings ?? {}),
    };
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "project.update",
      status: "info",
      summary: `Projeto ${workspace.project.name} atualizado.`,
    });
    return workspace;
  }

  rescanProject(projectId: string) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const projectRoot = this.normalizeProjectRootInput(workspace.settings.projectRoot);

    if (!projectRoot) {
      throw new Error(`Project root não encontrado: ${projectId}`);
    }

    const normalizedRoot = isAbsolute(projectRoot)
      ? projectRoot
      : resolve(getNexusHome(), projectRoot);
    const discovered = inspectWorkspaceSeed(projectId, normalizedRoot, workspace.project.name);

    workspace.settings = {
      ...workspace.settings,
      ...discovered.settings,
      personalityMode: workspace.settings.personalityMode,
      personalityIntensity: workspace.settings.personalityIntensity,
    };
    workspace.project.description = this.shouldReplaceDescription(workspace.project.description)
      ? discovered.description
      : workspace.project.description;
    workspace.tasks = [
      ...workspace.tasks.filter((task) => !isDiscoveryManagedText(task.description)),
      ...discovered.tasks,
    ];
    workspace.milestones = [
      ...workspace.milestones.filter((milestone) => !isDiscoveryManagedText(milestone.description)),
      ...discovered.milestones,
    ];
    workspace.logs = [
      ...discovered.logs,
      ...workspace.logs.filter((entry) => !entry.action.startsWith("project.discovery.")),
    ].slice(0, 200);
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "project.rescan",
      status: "success",
      summary: `Projeto ${workspace.project.name} reindexado a partir de ${normalizedRoot}.`,
    });
    return workspace;
  }

  deleteProject(projectId: string) {
    const state = this.store.read();
    const index = state.workspaces.findIndex((workspace) => workspace.project.id === projectId);

    if (index === -1) {
      return undefined;
    }

    const [removed] = state.workspaces.splice(index, 1);

    if (state.workspaces.length === 0) {
      const fallback = this.buildInitialWorkspace(getNexusHome());
      state.workspaces.push(fallback);
      state.activeProjectId = fallback.project.id;
    } else if (state.activeProjectId === projectId) {
      state.activeProjectId = state.workspaces[0].project.id;
    }

    this.store.write(state);
    return removed;
  }

  setActiveProject(projectId: string) {
    const state = this.store.read();
    const exists = state.workspaces.some((workspace) => workspace.project.id === projectId);

    if (!exists) {
      return undefined;
    }

    state.activeProjectId = projectId;
    this.store.write(state);
    const workspace = state.workspaces.find((item) => item.project.id === projectId);

    if (workspace) {
      this.appendLog(projectId, {
        agent: "system",
        action: "project.activate",
        status: "info",
        summary: `Projeto ${workspace.project.name} definido como ativo.`,
      });
    }

    return workspace;
  }

  listTasks(projectId: string) {
    return this.requireProject(projectId).tasks
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getTask(projectId: string, taskId: string) {
    return this.requireProject(projectId).tasks.find((task) => task.id === taskId);
  }

  createTask(projectId: string, input: {
    title: string;
    description?: string;
    status?: NexusTask["status"];
    priority?: NexusTask["priority"];
    dueDate?: string;
  }) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const now = new Date().toISOString();
    const task: NexusTask = {
      id: uuidv4(),
      title: input.title.trim(),
      description: input.description?.trim(),
      status: input.status ?? "pending",
      priority: input.priority ?? "medium",
      dueDate: input.dueDate?.trim(),
      createdAt: now,
      updatedAt: now,
    };

    workspace.tasks.unshift(task);
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "task.create",
      status: "success",
      summary: `Tarefa criada: ${task.title}.`,
    });
    return task;
  }

  updateTask(projectId: string, taskId: string, input: Partial<Omit<NexusTask, "id" | "createdAt" | "updatedAt">>) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const task = workspace.tasks.find((item) => item.id === taskId);

    if (!task) {
      return undefined;
    }

    task.title = input.title?.trim() ?? task.title;
    task.description = input.description?.trim() ?? task.description;
    task.status = input.status ?? task.status;
    task.priority = input.priority ?? task.priority;
    task.dueDate = input.dueDate?.trim() ?? task.dueDate;
    task.updatedAt = new Date().toISOString();
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "task.update",
      status: "info",
      summary: `Tarefa atualizada: ${task.title}.`,
    });
    return task;
  }

  deleteTask(projectId: string, taskId: string) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const index = workspace.tasks.findIndex((item) => item.id === taskId);

    if (index === -1) {
      return undefined;
    }

    const [removed] = workspace.tasks.splice(index, 1);
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "task.delete",
      status: "warning",
      summary: `Tarefa removida: ${removed.title}.`,
    });
    return removed;
  }

  listMilestones(projectId: string) {
    return this.requireProject(projectId).milestones
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  createMilestone(projectId: string, input: {
    title: string;
    description?: string;
    status?: NexusMilestone["status"];
    targetDate?: string;
  }) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const now = new Date().toISOString();
    const milestone: NexusMilestone = {
      id: uuidv4(),
      title: input.title.trim(),
      description: input.description?.trim(),
      status: input.status ?? "pending",
      targetDate: input.targetDate?.trim(),
      createdAt: now,
      updatedAt: now,
    };

    workspace.milestones.unshift(milestone);
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "milestone.create",
      status: "success",
      summary: `Marco criado: ${milestone.title}.`,
    });
    return milestone;
  }

  updateMilestone(projectId: string, milestoneId: string, input: Partial<Omit<NexusMilestone, "id" | "createdAt" | "updatedAt">>) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const milestone = workspace.milestones.find((item) => item.id === milestoneId);

    if (!milestone) {
      return undefined;
    }

    milestone.title = input.title?.trim() ?? milestone.title;
    milestone.description = input.description?.trim() ?? milestone.description;
    milestone.status = input.status ?? milestone.status;
    milestone.targetDate = input.targetDate?.trim() ?? milestone.targetDate;
    milestone.updatedAt = new Date().toISOString();
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "milestone.update",
      status: "info",
      summary: `Marco atualizado: ${milestone.title}.`,
    });
    return milestone;
  }

  deleteMilestone(projectId: string, milestoneId: string) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const index = workspace.milestones.findIndex((item) => item.id === milestoneId);

    if (index === -1) {
      return undefined;
    }

    const [removed] = workspace.milestones.splice(index, 1);
    this.store.write(state);
    this.appendLog(projectId, {
      agent: "system",
      action: "milestone.delete",
      status: "warning",
      summary: `Marco removido: ${removed.title}.`,
    });
    return removed;
  }

  listLogs(projectId: string, limit = 50) {
    return this.requireProject(projectId).logs
      .slice()
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, limit);
  }

  appendLog(projectId: string, input: {
    agent: NexusProjectLog["agent"];
    action: string;
    status: NexusProjectLog["status"];
    summary: string;
    details?: string;
  }) {
    const state = this.store.read();
    const workspace = this.requireProjectFromState(state, projectId);
    const entry: NexusProjectLog = {
      id: uuidv4(),
      projectId,
      agent: input.agent,
      action: input.action,
      status: input.status,
      summary: input.summary,
      details: input.details,
      timestamp: new Date().toISOString(),
    };

    workspace.logs.unshift(entry);
    workspace.logs = workspace.logs.slice(0, 200);
    this.store.write(state);
    return entry;
  }

  getTaskStats(projectId: string): ProjectTaskStats {
    const tasks = this.requireProject(projectId).tasks;
    const today = new Date().toISOString().slice(0, 10);

    return {
      total: tasks.length,
      pending: tasks.filter((task) => task.status === "pending").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      completed: tasks.filter((task) => task.status === "completed").length,
      overdue: tasks.filter((task) => Boolean(task.dueDate) && task.status !== "completed" && String(task.dueDate).slice(0, 10) < today).length,
    };
  }

  getMilestoneStats(projectId: string): ProjectMilestoneStats {
    const milestones = this.requireProject(projectId).milestones;
    return {
      total: milestones.length,
      pending: milestones.filter((item) => item.status === "pending").length,
      inProgress: milestones.filter((item) => item.status === "in_progress").length,
      completed: milestones.filter((item) => item.status === "completed").length,
    };
  }

  buildAgenda(projectId: string): ProjectAgendaSnapshot {
    const tasks = this.requireProject(projectId).tasks.slice();
    const today = new Date().toISOString().slice(0, 10);

    return {
      overdue: tasks.filter((task) => Boolean(task.dueDate) && task.status !== "completed" && String(task.dueDate).slice(0, 10) < today),
      today: tasks.filter((task) => Boolean(task.dueDate) && String(task.dueDate).slice(0, 10) === today && task.status !== "completed"),
      upcoming: tasks.filter((task) => Boolean(task.dueDate) && String(task.dueDate).slice(0, 10) > today && task.status !== "completed"),
      withoutDueDate: tasks.filter((task) => !task.dueDate && task.status !== "completed"),
      completed: tasks.filter((task) => task.status === "completed").slice(0, 10),
    };
  }

  buildLogSummary(projectId: string, extraLogs: NexusProjectLog[] = []) {
    const logs = [...extraLogs, ...this.listLogs(projectId, 100)];
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
          : "Ainda não há atividade suficiente para gerar um resumo automático.",
    };
  }

  private requireProject(projectId: string) {
    const workspace = this.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto não encontrado: ${projectId}`);
    }

    return workspace;
  }

  private requireProjectFromState(state: NexusProjectsState, projectId: string) {
    const workspace = state.workspaces.find((item) => item.project.id === projectId);

    if (!workspace) {
      throw new Error(`Projeto não encontrado: ${projectId}`);
    }

    return workspace;
  }

  private repairPersistedText() {
    const state = this.store.read();
    const repaired = this.repairValue(state);

    if (JSON.stringify(repaired) !== JSON.stringify(state)) {
      this.store.write(repaired);
    }
  }

  private repairValue<T>(value: T): T {
    if (typeof value === "string") {
      return this.repairText(value) as T;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.repairValue(entry)) as T;
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, this.repairValue(entry)]),
      ) as T;
    }

    return value;
  }

  private repairText(value: string) {
    if (!/[ÃÂâï�]/.test(value)) {
      return value;
    }

    try {
      const repaired = Buffer.from(value, "latin1").toString("utf8");
      return this.countMojibakeArtifacts(repaired) < this.countMojibakeArtifacts(value)
        ? repaired
        : value;
    } catch {
      return value;
    }
  }

  private countMojibakeArtifacts(value: string) {
    return (value.match(/Ã.|Â.|â.|ï¿½|�/g) ?? []).length;
  }

  private buildInitialState(): NexusProjectsState {
    const primaryRoot = getTargetProjectRoot();
    const nexusHome = getNexusHome();
    const workspaces = [this.buildInitialWorkspace(primaryRoot)];

    if (nexusHome !== primaryRoot) {
      workspaces.push(this.buildInitialWorkspace(nexusHome));
    }

    return {
      activeProjectId: workspaces[0]?.project.id,
      workspaces,
    };
  }

  private buildInitialWorkspace(root: string): NexusProjectWorkspace {
    const name = basename(root) || "Projeto inicial";
    const now = new Date().toISOString();
    const projectId = uuidv4();

    return {
      project: {
        id: projectId,
        name,
        description: `Projeto inicial conectado ao Nexus em ${root}.`,
        createdAt: now,
        state: "active",
      },
      settings: {
        projectRoot: root,
        personalityMode: "sarcastic",
        personalityIntensity: "medium",
        stackHint: "workspace local",
        lastIndexedAt: now,
      },
      tasks: [],
      milestones: [],
      logs: [
        {
          id: uuidv4(),
          projectId,
          agent: "system",
          timestamp: now,
          action: "project.bootstrap",
          status: "info",
          summary: `Projeto inicial ${name} preparado no Nexus.`,
          details: root,
        },
      ],
    };
  }

  private shouldReplaceDescription(description: string) {
    return !description.trim() || description.startsWith("Workspace importado de ");
  }

  private normalizeProjectRootInput(projectRoot?: string) {
    const raw = projectRoot?.trim();

    if (!raw) {
      return undefined;
    }

    const repaired = Buffer.from(raw, "latin1").toString("utf8");
    const candidates = Array.from(new Set([raw, repaired]));

    for (const candidate of candidates) {
      const absoluteCandidate = isAbsolute(candidate)
        ? candidate
        : resolve(getNexusHome(), candidate);

      if (absoluteCandidate && this.pathExists(absoluteCandidate)) {
        return candidate;
      }
    }

    return raw;
  }

  private pathExists(directory: string) {
    return existsSync(directory);
  }
}
