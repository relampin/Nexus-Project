import { CommandRecord } from "../core/types";
import {
  NexusMilestone,
  NexusProjectLog,
  NexusTask,
  ProjectFileOverview,
  ProjectSearchResult,
  ProjectSearchSnapshot,
  ProjectSummarySnapshot,
} from "../projects/types";

export class ProjectSearchService {
  search(input: {
    query: string;
    tasks: NexusTask[];
    milestones: NexusMilestone[];
    logs: NexusProjectLog[];
    commands: CommandRecord[];
    files: ProjectFileOverview;
    summary: ProjectSummarySnapshot;
  }): ProjectSearchSnapshot {
    const query = input.query.trim();

    if (!query) {
      return {
        query,
        total: 0,
        items: [],
      };
    }

    const normalizedQuery = this.normalize(query);
    const results: ProjectSearchResult[] = [];

    for (const task of input.tasks) {
      if (!this.matches(normalizedQuery, task.title, task.description)) {
        continue;
      }

      results.push({
        id: `task-${task.id}`,
        type: "task",
        title: task.title,
        subtitle: `Tarefa • ${task.status}`,
        snippet: task.description ?? "Sem descrição adicional.",
        timestamp: task.updatedAt,
        status: task.status,
        taskId: task.id,
      });
    }

    for (const milestone of input.milestones) {
      if (!this.matches(normalizedQuery, milestone.title, milestone.description)) {
        continue;
      }

      results.push({
        id: `milestone-${milestone.id}`,
        type: "milestone",
        title: milestone.title,
        subtitle: `Marco • ${milestone.status}`,
        snippet: milestone.description ?? "Sem descrição adicional.",
        timestamp: milestone.updatedAt,
        status: milestone.status,
      });
    }

    for (const log of input.logs) {
      if (!this.matches(normalizedQuery, log.summary, log.details, log.action, log.agent)) {
        continue;
      }

      results.push({
        id: `log-${log.id}`,
        type: "log",
        title: log.summary,
        subtitle: `Log • ${log.agent}`,
        snippet: log.details ?? log.action,
        timestamp: log.timestamp,
        status: log.status,
      });
    }

    for (const command of input.commands) {
      const payloadText = String(command.payload.text ?? "");
      const resultText = this.stringify(command.result);

      if (!this.matches(normalizedQuery, payloadText, resultText, command.kind, command.target, command.status)) {
        continue;
      }

      results.push({
        id: `command-${command.id}`,
        type: "command",
        title: `${command.source} -> ${command.target}`,
        subtitle: `Job • ${command.kind} • ${command.status}`,
        snippet: payloadText || resultText || "Sem detalhe textual no job.",
        timestamp: command.updatedAt,
        status: command.status,
        commandId: command.id,
        taskId: command.meta?.taskId,
      });
    }

    for (const file of input.files.entries ?? []) {
      if (!this.matches(normalizedQuery, file.path, file.preview, file.category, file.extension)) {
        continue;
      }

      results.push({
        id: `file-${file.path}`,
        type: "file",
        title: file.path,
        subtitle: `Arquivo • ${file.category}`,
        snippet: file.preview ?? "Arquivo sem preview textual.",
        timestamp: file.modifiedAt,
        path: file.path,
      });
    }

    const summaryText = [
      input.summary.summary.text,
      ...input.summary.summary.highlights,
      ...input.summary.narrator.messages.map((message) => message.text),
    ].join("\n");

    if (this.matches(normalizedQuery, summaryText)) {
      results.push({
        id: `summary-${input.summary.projectId}`,
        type: "summary",
        title: input.summary.summary.title,
        subtitle: "Resumo inteligente",
        snippet: input.summary.summary.text,
        timestamp: input.summary.summary.lastUpdated,
      });
    }

    const sorted = results
      .sort((left, right) => (right.timestamp ?? "").localeCompare(left.timestamp ?? ""))
      .slice(0, 30);

    return {
      query,
      total: sorted.length,
      items: sorted,
    };
  }

  private matches(normalizedQuery: string, ...values: Array<string | undefined>) {
    return values.some((value) => this.normalize(value).includes(normalizedQuery));
  }

  private normalize(value?: string) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private stringify(value: unknown) {
    if (typeof value === "string") {
      return value;
    }

    if (!value) {
      return "";
    }

    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
}
