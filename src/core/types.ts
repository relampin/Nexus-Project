export type AgentName = "antigravity" | "codex" | "system";

export type CommandKind =
  | "ping"
  | "note"
  | "task"
  | "list_pending"
  | "status_summary";

export type CommandStatus =
  | "pending"
  | "processing"
  | "awaiting_external"
  | "completed"
  | "failed";

export interface CommandPayload {
  text?: string;
  [key: string]: unknown;
}

export interface AntigravityGuardrailPayload {
  scope?: "frontend" | "mixed";
  allowedPaths?: string[];
  blockedPaths?: string[];
  monitor?: boolean;
  stopOnViolation?: boolean;
}

export interface DeliveryCommandMeta {
  mode?: "cdp" | "manual";
  deliveredAt?: string;
  promptInjectedAt?: string;
}

export interface GuardrailCommandMeta {
  alertInjectedAt?: string;
  violatingFiles?: string[];
  correctionForId?: string;
  autoCorrectionDepth?: number;
}

export interface CommandMeta {
  channel?: "api" | "ui" | "bridge";
  delegatedBy?: AgentName;
  projectId?: string;
  taskId?: string;
  taskTitle?: string;
  initiatedFrom?: "agenda" | "manual_dispatch" | "automation";
  delivery?: DeliveryCommandMeta;
  guardrail?: GuardrailCommandMeta;
}

export interface CommandRequest {
  source: AgentName;
  target: AgentName;
  kind: CommandKind;
  payload: CommandPayload;
  meta?: CommandMeta;
}

export interface CommandRecord extends CommandRequest {
  id: string;
  status: CommandStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  result?: unknown;
  error?: string;
  external?: ExternalDispatch;
}

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  awaitingExternal: number;
  completed: number;
  failed: number;
}

export interface AdapterContext {
  getPendingCommands(): CommandRecord[];
  getQueueStats(): QueueStats;
  getProjectRoot(projectId?: string): string;
}

export interface AdapterResult {
  message: string;
  data?: unknown;
}

export interface ExternalDispatch {
  provider: "antigravity" | "codex";
  projectRoot: string;
  channel?: "file" | "cdp" | "manual";
  requestFile: string;
  responseFile: string;
  logFile?: string;
  reviewFile?: string;
  requestText?: string;
  dispatchedAt: string;
  message: string;
  monitor?: {
    projectRoot: string;
    scope: "frontend" | "mixed";
    enabled: boolean;
    allowedPaths: string[];
    blockedPaths: string[];
    stopOnViolation: boolean;
    baselineFile: string;
    reviewFile: string;
  };
}

export type DispatchResult =
  | {
      mode: "immediate";
      result: AdapterResult;
    }
  | {
      mode: "external";
      external: ExternalDispatch;
    };

export interface AgentAdapter {
  name: AgentName;
  execute(command: CommandRecord, context: AdapterContext): Promise<DispatchResult>;
}
