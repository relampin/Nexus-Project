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
export type ProjectProfileId = "general" | "web_app" | "backend_service" | "automation" | "site" | "ai_hub";
export type UiThemePresetId = "nexus" | "ocean" | "ember" | "forest" | "graphite";
export type UiPanelMode = "full" | "simplified";

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
  profileId?: ProjectProfileId;
  stackHint?: string;
  lastIndexedAt?: string;
}

export interface ProjectPersonalityConfig {
  mode: ProjectPersonalityMode;
  intensity: ProjectPersonalityIntensity;
}

export interface ProjectProfileDefinition {
  id: ProjectProfileId;
  label: string;
  description: string;
  focusAreas: string[];
}

export interface NexusUiThemePreset {
  id: UiThemePresetId;
  label: string;
  description: string;
  colors: {
    bg: string;
    surface: string;
    surfaceHover: string;
    primary: string;
    secondary: string;
    primaryGlow: string;
    secondaryGlow: string;
  };
}

export interface NexusUiPreferences {
  themePreset: UiThemePresetId;
  panelMode: UiPanelMode;
  updatedAt: string;
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

export interface ProjectAgendaOperationalSnapshot {
  immediate: NexusTask[];
  thisWeek: NexusTask[];
  atRisk: NexusTask[];
  blocked: NexusTask[];
  nextUp: NexusTask[];
  recentlyCompleted: NexusTask[];
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

export interface ProjectRadarAction {
  id: string;
  label: string;
  description: string;
  target: "codex" | "antigravity";
  variant: "primary" | "secondary" | "warning";
  commandText: string;
}

export interface ProjectRadarSnapshot {
  headline: string;
  risk: string;
  blocker: string;
  nextDelivery: string;
  checkpoints: string[];
  actions: ProjectRadarAction[];
}

export interface ProjectTaskExecutionSnapshot {
  taskId: string;
  title: string;
  priority: NexusTaskPriority;
  status: NexusTaskState;
  dueDate?: string;
  linkedCommandId?: string;
  linkedCommandStatus?: string;
  linkedCommandTarget?: string;
  linkedCommandUpdatedAt?: string;
  linkedResultSummary?: string;
}

export interface ProjectTaskBoardLane {
  id: string;
  label: string;
  count: number;
  items: ProjectTaskExecutionSnapshot[];
}

export interface ProjectTaskBoardSnapshot {
  lanes: ProjectTaskBoardLane[];
}

export interface ProjectTimelineEvent {
  id: string;
  timestamp: string;
  kind: "task" | "milestone" | "log" | "command" | "validation" | "git";
  title: string;
  detail: string;
  status: "info" | "success" | "warning" | "error";
  agent?: NexusLogAgent;
  taskId?: string;
  milestoneId?: string;
  commandId?: string;
}

export interface ProjectGitFileChange {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export interface ProjectGitCommitSnapshot {
  hash: string;
  summary: string;
  author: string;
  timestamp: string;
}

export interface ProjectGitSnapshot {
  available: boolean;
  root?: string;
  branch?: string;
  clean: boolean;
  ahead: number;
  behind: number;
  summary: string;
  changedFiles: ProjectGitFileChange[];
  recentCommits: ProjectGitCommitSnapshot[];
  error?: string;
}

export interface ProjectValidationStep {
  id: string;
  label: string;
  status: "pending" | "passed" | "failed" | "skipped";
  summary: string;
  command?: string;
  output?: string;
}

export interface ProjectValidationSnapshot {
  status: "idle" | "passed" | "failed" | "warning";
  lastRunAt?: string;
  summary: string;
  steps: ProjectValidationStep[];
  triggeredBy?: string;
}

export interface ProjectDigestSnapshot {
  generatedAt: string;
  title: string;
  summary: string;
  wins: string[];
  risks: string[];
  nextSteps: string[];
}

export interface ProjectSearchResult {
  id: string;
  type: "task" | "milestone" | "log" | "command" | "file" | "summary";
  title: string;
  subtitle: string;
  snippet: string;
  timestamp?: string;
  path?: string;
  status?: string;
  taskId?: string;
  commandId?: string;
}

export interface ProjectSearchSnapshot {
  query: string;
  total: number;
  items: ProjectSearchResult[];
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
  profile: ProjectProfileDefinition;
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
  profile: ProjectProfileDefinition;
  dashboard: ProjectDashboardSnapshot;
  tasks: NexusTask[];
  milestones: NexusMilestone[];
  agenda: ProjectAgendaSnapshot;
  agendaOperational: ProjectAgendaOperationalSnapshot;
  radar: ProjectRadarSnapshot;
  taskBoard: ProjectTaskBoardSnapshot;
  timeline: ProjectTimelineEvent[];
  git: ProjectGitSnapshot;
  validation: ProjectValidationSnapshot;
  digest: ProjectDigestSnapshot;
  logs: NexusProjectLog[];
  commands: unknown[];
  report: ProjectLogSummary;
  files: ProjectFileOverview;
  summary: ProjectSummaryData;
  narrator: ProjectNarratorData;
}
