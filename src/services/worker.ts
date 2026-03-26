import { existsSync, readFileSync } from "node:fs";
import { PersistentQueue } from "../core/queue";
import { AdapterContext, CommandRecord, CommandRequest } from "../core/types";
import { NexusProjectsService } from "../projects/service";
import { createAntigravityReviewReport, inspectAntigravityGuardrails, writeAntigravityReviewReport } from "./antigravityGuard";
import { buildAntigravityCorrectionPrompt } from "./antigravityPrompt";
import { AntigravitySessionMonitor } from "./antigravitySessionMonitor";
import { InformalLogger } from "./logger";
import { Orchestrator } from "./orchestrator";

export class WorkerService {
  private isRunning = false;

  constructor(
    private readonly queue: PersistentQueue,
    private readonly orchestrator: Orchestrator,
    private readonly logger: InformalLogger,
    private readonly projects: NexusProjectsService,
    private readonly antigravityMonitor: AntigravitySessionMonitor,
  ) {}

  async processPending() {
    if (this.isRunning) {
      return 0;
    }

    this.isRunning = true;
    let processed = 0;

    try {
      while (true) {
        const next = this.queue.getNextPending();

        if (!next) {
          break;
        }

        await this.processSingle(next);
        processed += 1;
      }

      return processed;
    } finally {
      this.isRunning = false;
    }
  }

  async collectExternalResults() {
    let collected = 0;

    for (const command of this.queue.list().filter((item) => item.status === "awaiting_external" && item.external)) {
      const external = command.external;

      if (!external) {
        continue;
      }

      if (external.channel === "telegram") {
        if (external.provider === "antigravity") {
          const responseFile = external.logFile ?? external.responseFile;

          if (!existsSync(responseFile)) {
            continue;
          }

          try {
            const raw = readFileSync(responseFile, "utf-8").trim();

            if (!raw) {
              continue;
            }

            const inspection = inspectAntigravityGuardrails(command, raw);

            if (inspection?.missingLogSections.length) {
              throw new Error(`Log do Antigravity incompleto. Faltando secoes: ${inspection.missingLogSections.join(", ")}`);
            }

            if (inspection?.violatingFiles.length && external.monitor?.stopOnViolation) {
              throw new Error(`Antigravity saiu do escopo permitido: ${inspection.violatingFiles.join(", ")}`);
            }

            const review = createAntigravityReviewReport(command, raw);
            const reviewFile = external.reviewFile ?? external.monitor?.reviewFile;
            const sessionEvidence = this.antigravityMonitor.getJobEvidence(command.id) ?? null;

            if (reviewFile) {
              writeAntigravityReviewReport(reviewFile, review);
            }

            this.logger.logReviewResult(command, review.summary);
            this.appendProjectLog(command, {
              agent: "system",
              action: "antigravity.review",
              status: review.status === "failed" ? "warning" : "success",
              summary: review.summary,
              details: reviewFile,
            });

            if (review.status === "failed") {
              const correction = this.enqueueAntigravityCorrection(command, review, reviewFile);
              const correctionMessage = correction
                ? ` Review de correcao criado: ${correction.id}.`
                : "";

              throw new Error(`Review automatico falhou: ${review.summary}.${correctionMessage}`.trim());
            }

            const completed = this.queue.markCompleted(command.id, {
              provider: external.provider,
              responseFile,
              message: this.buildAntigravitySummary(raw, command.id),
              data: {
                provider: external.provider,
                response: {
                  status: "ok",
                  summary: this.buildAntigravitySummary(raw, command.id),
                  details: raw,
                  finishedAt: new Date().toISOString(),
                },
                monitor: {
                  guardrails: inspection ?? null,
                  session: sessionEvidence,
                },
                review,
                reviewFile: reviewFile ?? null,
              },
            });

            if (completed) {
              this.logger.logCompleted(completed);
              this.appendProjectLog(completed, {
                agent: external.provider,
                action: `command.${completed.kind}.completed`,
                status: "success",
                summary: this.buildAntigravitySummary(raw, command.id),
                details: responseFile,
              });
              collected += 1;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid external response";
            const failed = this.queue.markFailed(command.id, message);

            if (failed) {
              this.logger.logFailed(failed, message);
              this.appendProjectLog(failed, {
                agent: failed.target,
                action: `command.${failed.kind}.failed`,
                status: "error",
                summary: message,
              });
              collected += 1;
            }
          }
        }

        continue;
      }

      const responseFile = external.responseFile;

      if (!existsSync(responseFile)) {
        continue;
      }

      try {
        const raw = readFileSync(responseFile, "utf-8");
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
        const completed = this.queue.markCompleted(command.id, {
          provider: external.provider,
          responseFile,
          response: parsed,
        });

        if (completed) {
          this.logger.logCompleted(completed);
          this.appendProjectLog(completed, {
            agent: external.provider,
            action: `command.${completed.kind}.completed`,
            status: "success",
            summary: `Resposta externa recebida de ${external.provider}.`,
            details: responseFile,
          });
          collected += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid external response";
        const failed = this.queue.markFailed(command.id, message);

        if (failed) {
          this.logger.logFailed(failed, message);
          this.appendProjectLog(failed, {
            agent: failed.target,
            action: `command.${failed.kind}.failed`,
            status: "error",
            summary: message,
          });
          collected += 1;
        }
      }
    }

    return collected;
  }

  private buildAntigravitySummary(rawLog: string, commandId: string) {
    const lines = rawLog.split(/\r?\n/).map((line) => line.trim());
    const workIndex = lines.findIndex((line) => /^#{1,6}\s+o que fiz:/i.test(line));

    if (workIndex >= 0) {
      const workLine = lines.slice(workIndex + 1).find((line) => line);

      if (workLine) {
        return workLine;
      }
    }

    const firstUsefulLine = lines.find((line) => line && !line.startsWith("#") && !line.startsWith("**"));

    return firstUsefulLine ?? `Antigravity concluiu o job ${commandId} e registrou os detalhes no log.`;
  }

  private enqueueAntigravityCorrection(command: CommandRecord, review: ReturnType<typeof createAntigravityReviewReport>, reviewFile?: string) {
    const currentDepth = command.meta?.guardrail?.autoCorrectionDepth ?? 0;

    if (currentDepth >= 1) {
      return null;
    }

    const correctionRequest: CommandRequest = {
      source: "system",
      target: "antigravity",
      kind: "task",
      payload: {
        text: buildAntigravityCorrectionPrompt(command, review, reviewFile),
        guardrails: {
          scope: command.external?.monitor?.scope ?? "frontend",
          allowedPaths: command.external?.monitor?.allowedPaths ?? undefined,
          blockedPaths: command.external?.monitor?.blockedPaths ?? undefined,
          monitor: true,
          stopOnViolation: command.external?.monitor?.stopOnViolation ?? true,
        },
      },
      meta: {
        channel: "api",
        delegatedBy: "codex",
        projectId: command.meta?.projectId,
        guardrail: {
          correctionForId: command.id,
          autoCorrectionDepth: currentDepth + 1,
        },
        telegram: {
          replyChatId: command.meta?.telegram?.replyChatId,
        },
      },
    };

    const correction = this.queue.enqueue(correctionRequest);
    this.logger.logAccepted(correction);
    this.logger.logAutoCorrection(command, correction.id, review.summary);
    return correction;
  }

  private async processSingle(command: CommandRecord) {
    const processing = this.queue.markProcessing(command.id);

    if (!processing) {
      return;
    }

    try {
      const dispatch = await this.orchestrator.dispatch(processing, this.buildContext());

      if (dispatch.mode === "immediate") {
        const completed = this.queue.markCompleted(processing.id, dispatch.result);

        if (completed) {
          this.logger.logCompleted(completed);
          this.appendProjectLog(completed, {
            agent: completed.target,
            action: `command.${completed.kind}.completed`,
            status: "success",
            summary: dispatch.result.message,
          });
        }
        return;
      }

      const awaitingExternal = this.queue.markAwaitingExternal(processing.id, dispatch.external);

      if (awaitingExternal) {
        this.logger.logExternalDispatch(awaitingExternal);
        this.appendProjectLog(awaitingExternal, {
          agent: "system",
          action: `command.${awaitingExternal.kind}.delegated`,
          status: "info",
          summary: `Job delegado para ${dispatch.external.provider}.`,
          details: dispatch.external.requestFile,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error";
      const failed = this.queue.markFailed(processing.id, message);

      if (failed) {
        this.logger.logFailed(failed, message);
        this.appendProjectLog(failed, {
          agent: failed.target,
          action: `command.${failed.kind}.failed`,
          status: "error",
          summary: message,
        });
      }
    }
  }

  private buildContext(): AdapterContext {
    return {
      getPendingCommands: () => this.queue.list().filter((item) => item.status === "pending"),
      getQueueStats: () => this.queue.getStats(),
      getProjectRoot: (projectId?: string) => this.projects.getProjectRoot(projectId),
    };
  }

  private appendProjectLog(
    command: { meta?: { projectId?: string }; kind?: string; target?: "antigravity" | "codex" | "system" } | undefined,
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
      // Mantemos o fluxo do worker mesmo se o projeto tiver sido removido.
    }
  }
}
