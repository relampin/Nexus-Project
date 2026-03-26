import { JsonFileStore } from "../core/storage";
import { PersistentQueue } from "../core/queue";
import { resolveNexusPath } from "../core/paths";
import { NexusProjectsService } from "../projects/service";
import { ProjectSummaryAudioStatus, ProjectSummarySnapshot, ProjectWorkspaceSnapshot } from "../projects/types";
import { detectInvalidatedCommand } from "./auditHeuristics";

export interface AuditFinding {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
  detail: string;
  projectId?: string;
  commandId?: string;
}

export interface InvalidatedCommandAnnotation {
  commandId: string;
  reason: string;
  invalidatedAt: string;
  evidence: string[];
}

export interface AuditSummary {
  status: "healthy" | "attention" | "critical";
  generatedAt: string;
  findings: {
    errors: number;
    warnings: number;
    infos: number;
  };
  highlights: string[];
  invalidatedCommands: number;
}

export interface AuditReport extends AuditSummary {
  findingsList: AuditFinding[];
  annotations: {
    invalidatedCommands: Record<string, InvalidatedCommandAnnotation>;
  };
  checkedProjects: string[];
  checkedCommands: string[];
}

interface AuditStoreState {
  latest?: AuditReport;
}

const initialAuditStore: AuditStoreState = {};
const validAudioStatuses = new Set<ProjectSummaryAudioStatus>(["idle", "generating", "ready", "playing", "paused", "failed"]);

interface AuditRuntimeContext {
  getProjectSnapshot(projectId: string): ProjectWorkspaceSnapshot | undefined;
  getProjectSummary(projectId: string): ProjectSummarySnapshot;
}

export class NexusAuditService {
  private readonly store = new JsonFileStore<AuditStoreState>(
    resolveNexusPath("data", "audit-report.json"),
    initialAuditStore,
  );

  constructor(
    private readonly queue: PersistentQueue,
    private readonly projects: NexusProjectsService,
  ) {}

  getLatestReport() {
    return this.store.read().latest;
  }

  getLatestSummary(): AuditSummary | undefined {
    const latest = this.getLatestReport();

    if (!latest) {
      return undefined;
    }

    return {
      status: latest.status,
      generatedAt: latest.generatedAt,
      findings: latest.findings,
      highlights: latest.highlights,
      invalidatedCommands: latest.invalidatedCommands,
    };
  }

  run(context: AuditRuntimeContext) {
    const generatedAt = new Date().toISOString();
    const findings: AuditFinding[] = [];
    const annotations: Record<string, InvalidatedCommandAnnotation> = {};
    const workspaces = this.projects.listWorkspaces();
    const queueCommands = this.queue.list();
    const seenProjectIds = new Set<string>();
    const seenTaskIds = new Set<string>();
    const seenMilestoneIds = new Set<string>();

    const pushFinding = (finding: Omit<AuditFinding, "id">) => {
      findings.push({
        id: `audit-${findings.length + 1}`,
        ...finding,
      });
    };

    const activeProject = this.projects.getActiveProject();

    if (!activeProject) {
      pushFinding({
        severity: "error",
        title: "Projeto ativo ausente",
        detail: "O Nexus nao conseguiu resolver um projeto ativo valido.",
      });
    }

    for (const workspace of workspaces) {
      const projectId = workspace.project.id;

      if (seenProjectIds.has(projectId)) {
        pushFinding({
          severity: "error",
          title: "Projeto duplicado",
          detail: `O projeto ${workspace.project.name} apareceu mais de uma vez na persistencia.`,
          projectId,
        });
      }

      seenProjectIds.add(projectId);

      for (const task of workspace.tasks) {
        if (seenTaskIds.has(task.id)) {
          pushFinding({
            severity: "warning",
            title: "Tarefa com ID duplicado",
            detail: `A tarefa ${task.title} compartilha ID com outra tarefa.`,
            projectId,
          });
        }

        seenTaskIds.add(task.id);
      }

      for (const milestone of workspace.milestones) {
        if (seenMilestoneIds.has(milestone.id)) {
          pushFinding({
            severity: "warning",
            title: "Marco com ID duplicado",
            detail: `O marco ${milestone.title} compartilha ID com outro marco.`,
            projectId,
          });
        }

        seenMilestoneIds.add(milestone.id);
      }

      const invalidLogs = workspace.logs.filter((entry) => entry.projectId !== projectId);

      if (invalidLogs.length > 0) {
        pushFinding({
          severity: "error",
          title: "Logs apontando para outro projeto",
          detail: `${invalidLogs.length} log(s) deste workspace carregam projectId inconsistente.`,
          projectId,
        });
      }

      const snapshot = context.getProjectSnapshot(projectId);

      if (!snapshot) {
        pushFinding({
          severity: "error",
          title: "Snapshot de projeto ausente",
          detail: `O backend nao conseguiu montar o snapshot do projeto ${workspace.project.name}.`,
          projectId,
        });
        continue;
      }

      if (snapshot.project.id !== projectId) {
        pushFinding({
          severity: "error",
          title: "Snapshot inconsistente",
          detail: "O snapshot retornou um projeto diferente do solicitado.",
          projectId,
        });
      }

      const summarySnapshot = context.getProjectSummary(projectId);
      this.validateSummary(summarySnapshot, pushFinding, projectId, workspace.project.name);
    }

    for (const command of queueCommands) {
      const match = detectInvalidatedCommand(command);

      if (match) {
        annotations[command.id] = {
          commandId: command.id,
          reason: match.reason,
          invalidatedAt: generatedAt,
          evidence: match.evidence,
        };
      }

      const projectId = command.meta?.projectId;

      if (projectId && !seenProjectIds.has(projectId)) {
        pushFinding({
          severity: "warning",
          title: "Job ligado a projeto inexistente",
          detail: `O job ${command.id} aponta para um projeto que nao existe mais.`,
          commandId: command.id,
          projectId,
        });
      }

      if (command.status === "awaiting_external" && command.target === "antigravity" && !command.external?.logFile) {
        pushFinding({
          severity: "warning",
          title: "Job externo sem log final",
          detail: `O job ${command.id} esta aguardando o Antigravity sem logFile configurado.`,
          commandId: command.id,
          projectId,
        });
      }
    }

    if (activeProject && !seenProjectIds.has(activeProject.project.id)) {
      pushFinding({
        severity: "error",
        title: "Projeto ativo invalido",
        detail: "O projeto ativo atual nao existe mais na lista de workspaces.",
        projectId: activeProject.project.id,
      });
    }

    const errorCount = findings.filter((finding) => finding.severity === "error").length;
    const warningCount = findings.filter((finding) => finding.severity === "warning").length;
    const infoCount = findings.filter((finding) => finding.severity === "info").length;
    const status = errorCount > 0
      ? "critical"
      : warningCount > 0
        ? "attention"
        : "healthy";
    const highlights = this.buildHighlights(findings, annotations);

    const report: AuditReport = {
      status,
      generatedAt,
      findings: {
        errors: errorCount,
        warnings: warningCount,
        infos: infoCount,
      },
      highlights,
      invalidatedCommands: Object.keys(annotations).length,
      findingsList: findings,
      annotations: {
        invalidatedCommands: annotations,
      },
      checkedProjects: workspaces.map((workspace) => workspace.project.id),
      checkedCommands: queueCommands.map((command) => command.id),
    };

    this.store.write({ latest: report });
    return report;
  }

  private validateSummary(
    snapshot: ProjectSummarySnapshot,
    pushFinding: (finding: Omit<AuditFinding, "id">) => void,
    projectId: string,
    projectName: string,
  ) {
    if (snapshot.projectId !== projectId) {
      pushFinding({
        severity: "error",
        title: "Resumo ligado ao projeto errado",
        detail: `O resumo retornado para ${projectName} veio com projectId diferente do esperado.`,
        projectId,
      });
    }

    if (!snapshot.summary.text.trim()) {
      pushFinding({
        severity: "warning",
        title: "Resumo vazio",
        detail: `O projeto ${projectName} nao gerou texto de resumo.`,
        projectId,
      });
    }

    if (!snapshot.personality?.mode) {
      pushFinding({
        severity: "warning",
        title: "Personalidade ausente",
        detail: `O projeto ${projectName} nao informou o modo de personalidade do resumo.`,
        projectId,
      });
    }

    if (!snapshot.personality?.intensity) {
      pushFinding({
        severity: "warning",
        title: "Intensidade ausente",
        detail: `O projeto ${projectName} nao informou a intensidade da personalidade do resumo.`,
        projectId,
      });
    }

    if (!validAudioStatuses.has(snapshot.summary.audio.status)) {
      pushFinding({
        severity: "error",
        title: "Status de audio invalido",
        detail: `O projeto ${projectName} retornou um status de audio fora do contrato.`,
        projectId,
      });
    }

    if (!snapshot.summary.audio.provider) {
      pushFinding({
        severity: "error",
        title: "Provedor de audio ausente",
        detail: `O projeto ${projectName} nao informou o provider do resumo.`,
        projectId,
      });
    }

    if (!snapshot.summary.audio.voiceId) {
      pushFinding({
        severity: "warning",
        title: "voiceId ausente",
        detail: `O projeto ${projectName} nao informou voiceId no bloco de audio.`,
        projectId,
      });
    }

    if ((snapshot.summary.audio.status === "ready" || snapshot.summary.audio.status === "playing" || snapshot.summary.audio.status === "paused") && !snapshot.summary.audio.audioUrl) {
      pushFinding({
        severity: "warning",
        title: "Audio pronto sem URL",
        detail: `O projeto ${projectName} marcou o audio como reproduzivel sem audioUrl.`,
        projectId,
      });
    }

    if (!Array.isArray(snapshot.narrator.messages) || snapshot.narrator.messages.length === 0) {
      pushFinding({
        severity: "warning",
        title: "Narrador sem mensagens",
        detail: `O projeto ${projectName} ainda nao gerou mensagens para o narrador.`,
        projectId,
      });
    }
  }

  private buildHighlights(findings: AuditFinding[], annotations: Record<string, InvalidatedCommandAnnotation>) {
    if (findings.length === 0) {
      return [
        "Auditoria geral passou sem encontrar inconsistencias importantes.",
        `Historico invalidado rotulado: ${Object.keys(annotations).length}.`,
      ];
    }

    return findings
      .slice(0, 3)
      .map((finding) => `${finding.title}: ${finding.detail}`);
  }
}
