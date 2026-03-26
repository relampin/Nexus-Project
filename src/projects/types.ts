export type NexusProjectState = "active" | "paused" | "completed";
export type NexusTaskState = "pending" | "in_progress" | "completed";
export type NexusTaskPriority = "low" | "medium" | "high" | "critical";
export type NexusMilestoneState = "pending" | "in_progress" | "completed";
export type NexusLogStatus = "info" | "success" | "warning" | "error";
export type NexusLogAgent = "codex" | "antigravity" | "system";
export type ProjectSummaryAudioProvider = "internal" | "elevenlabs";
export type ProjectSummaryAudioStatus = "idle" | "generating" | "ready" | "playing" | "paused" | "failed";
export type ProjectPersonalityMode = "neutral" | "sarcastic";
export type ProjectPersonalityIntensity = "low" | "medium" | "high";

export interface NexusProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  state: NexusProjectState;
}

export interface NexusProjectSettings {
  projectRoot?: string;
  colorToken?: string;
  icon?: string;
  personalityMode?: ProjectPersonalityMode;
  personalityIntensity?: ProjectPersonalityIntensity;
  stackHint?: string;
  lastIndexedAt?: string;
}

export interface ProjectPersonalityConfig {
  mode: ProjectPersonalityMode;
  intensity: ProjectPersonalityIntensity;
}

export interface NexusTask {
  id: string;
  title: string;
  description?: string;
  status: NexusTaskState;
  priority: NexusTaskPriority;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NexusMilestone {
  id: string;
  title: string;
  description?: string;
  status: NexusMilestoneState;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NexusProjectLog {
  id: string;
  projectId: string;
  agent: NexusLogAgent;
  timestamp: string;
  action: string;
  status: NexusLogStatus;
  summary: string;
  details?: string;
}

export interface NexusProjectWorkspace {
  project: NexusProject;
  settings: NexusProjectSettings;
  tasks: NexusTask[];
  milestones: NexusMilestone[];
  logs: NexusProjectLog[];
}

export interface NexusProjectsState {
  activeProjectId?: string;
  workspaces: NexusProjectWorkspace[];
}

export interface ProjectTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export interface ProjectMilestoneStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export interface ProjectAgendaSnapshot {
  overdue: NexusTask[];
  today: NexusTask[];
  upcoming: NexusTask[];
  withoutDueDate: NexusTask[];
  completed: NexusTask[];
}

export interface ProjectQueueStats {
  total: number;
  pending: number;
  processing: number;
  awaitingExternal: number;
  completed: number;
  failed: number;
}

export interface ProjectLogSummary {
  total: number;
  agentSummary: {
    codex: number;
    antigravity: number;
    system: number;
  };
  latestEntries: string[];
  autoNarrative: string;
}

export interface ProjectFileEntry {
  path: string;
  name: string;
  extension: string;
  category: "code" | "config" | "docs" | "assets" | "logs" | "data" | "other";
  size: number;
  modifiedAt: string;
  isText: boolean;
  isKeyFile: boolean;
  preview?: string;
}

export interface ProjectFileDirectorySummary {
  path: string;
  fileCount: number;
}

export interface ProjectFileOverview {
  root: string;
  generatedAt: string;
  synopsis: string;
  totals: {
    files: number;
    textFiles: number;
    directories: number;
    bytes: number;
    keyFiles: number;
    unreadableFiles: number;
    omittedFiles: number;
  };
  keyFiles: string[];
  directories: ProjectFileDirectorySummary[];
  entries: ProjectFileEntry[];
}

export interface ProjectFileContentSnapshot {
  path: string;
  content: string;
  truncated: boolean;
  lineCount: number;
  size: number;
  modifiedAt: string;
}

export interface ProjectSummarySection {
  title: string;
  items: string[];
}

export interface ProjectNarratorMessage {
  text: string;
  timestamp: string;
  priority: "low" | "medium" | "high";
  audioUrl: string | null;
}

export interface ProjectNarratorData {
  lastUpdated: string;
  messages: ProjectNarratorMessage[];
}

export interface ProjectSummaryAudioState {
  status: ProjectSummaryAudioStatus;
  audioUrl?: string;
  contentType: string;
  generatedAt?: string;
  playbackUpdatedAt?: string;
  provider: ProjectSummaryAudioProvider;
  voiceId: string;
  error?: string;
  textHash?: string;
}

export interface ProjectSummaryData {
  title: string;
  text: string;
  lastUpdated: string;
  sourceUpdatedAt: string;
  sections: ProjectSummarySection[];
  highlights: string[];
  audioUrl?: string;
  status: ProjectSummaryAudioStatus;
  audio: ProjectSummaryAudioState;
}

export interface ProjectSummarySnapshot {
  projectId: string;
  personality: ProjectPersonalityConfig;
  summary: ProjectSummaryData;
  narrator: ProjectNarratorData;
}

export interface ProjectGamificationSnapshot {
  level: number;
  experiencePoints: number;
  currentLevelFloor: number;
  nextLevelAt: number;
  levelProgressPct: number;
}

export interface ProjectDashboardSnapshot {
  progress: {
    overallPct: number;
    tasksPct: number;
    milestonesPct: number;
    commandsPct: number;
  };
  gamification: ProjectGamificationSnapshot;
  status: {
    projectState: NexusProjectState;
    health: "steady" | "attention" | "strong";
    overdueTasks: number;
    pendingReviews: number;
    nextFocus: string;
  };
  tasks: ProjectTaskStats;
  milestones: ProjectMilestoneStats;
  queue: ProjectQueueStats;
  agendaCounts: {
    overdue: number;
    today: number;
    upcoming: number;
    withoutDueDate: number;
    completed: number;
  };
  logs: ProjectLogSummary;
}

export interface ProjectOverviewItem {
  project: NexusProject;
  settings: NexusProjectSettings;
  personality: ProjectPersonalityConfig;
  isActive: boolean;
  dashboard: ProjectDashboardSnapshot;
}

export interface ProjectsOverviewSnapshot {
  activeProjectId?: string;
  items: ProjectOverviewItem[];
}

export interface ProjectWorkspaceSnapshot {
  project: NexusProject;
  settings: NexusProjectSettings;
  personality: ProjectPersonalityConfig;
  dashboard: ProjectDashboardSnapshot;
  tasks: NexusTask[];
  milestones: NexusMilestone[];
  agenda: ProjectAgendaSnapshot;
  logs: NexusProjectLog[];
  commands: unknown[];
  report: ProjectLogSummary;
  files: ProjectFileOverview;
  summary: ProjectSummaryData;
  narrator: ProjectNarratorData;
}
