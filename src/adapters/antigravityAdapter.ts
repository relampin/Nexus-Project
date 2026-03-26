import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentAdapter, AdapterContext, CommandRecord, DispatchResult, ExternalDispatch } from "../core/types";
import { createAntigravityMonitor } from "../services/antigravityGuard";
import { buildAntigravityRequestBody } from "../services/antigravityPrompt";

export class AntigravityAdapter implements AgentAdapter {
  name = "antigravity" as const;

  async execute(command: CommandRecord, context: AdapterContext): Promise<DispatchResult> {
    const external = this.createBridgeDispatch(command, context);

    return {
      mode: "external",
      external,
    };
  }

  private createBridgeDispatch(command: CommandRecord, context: AdapterContext): ExternalDispatch {
    const projectRoot = context.getProjectRoot(command.meta?.projectId);
    const jobDirectory = join(projectRoot, "bridge", "antigravity", "jobs", command.id);
    const requestFile = join(jobDirectory, "request.md");
    const logDirectory = join(projectRoot, "log");
    const logFile = join(logDirectory, `${command.id}-antigravity.md`);
    const monitor = createAntigravityMonitor(command, jobDirectory, projectRoot);
    const requestBody = buildAntigravityRequestBody(command, context.getQueueStats(), requestFile, logFile, monitor, projectRoot);

    mkdirSync(jobDirectory, { recursive: true });
    mkdirSync(logDirectory, { recursive: true });
    writeFileSync(requestFile, requestBody, "utf-8");

    return {
      provider: "antigravity",
      projectRoot,
      channel: "manual",
      requestFile,
      responseFile: logFile,
      logFile,
      reviewFile: monitor?.reviewFile,
      requestText: String(command.payload.text ?? ""),
      dispatchedAt: new Date().toISOString(),
      message: "Handoff preparado para o Antigravity. O Nexus vai tentar entregar via CDP; se nao conseguir, o job fica em assistencia manual.",
      monitor,
    };
  }
}
