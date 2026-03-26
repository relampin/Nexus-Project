import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTargetProjectRoot } from "../core/paths";
import { AgentAdapter, AdapterContext, CommandRecord, DispatchResult, ExternalDispatch } from "../core/types";

export class CodexAdapter implements AgentAdapter {
  name = "codex" as const;

  async execute(command: CommandRecord, context: AdapterContext): Promise<DispatchResult> {
    const external = this.createExternalDispatch(command, context);
    const response = this.runOpenClaw(command, external);

    writeFileSync(external.responseFile, `${JSON.stringify(response, null, 2)}\n`, "utf-8");

    return {
      mode: "immediate",
      result: {
        message: response.summary,
        data: {
          provider: "openclaw",
          agent: this.getAgentId(),
          requestFile: external.requestFile,
          responseFile: external.responseFile,
          response,
        },
      },
    };
  }

  private createExternalDispatch(command: CommandRecord, context: AdapterContext): ExternalDispatch {
    const projectRoot = context.getProjectRoot(command.meta?.projectId);
    const jobDirectory = join(projectRoot, "bridge", "codex", "jobs", command.id);
    const requestFile = join(jobDirectory, "request.md");
    const responseFile = join(jobDirectory, "response.json");
    const schemaFile = join(jobDirectory, "response.schema.json");
    const requestBody = [
      `# Job ${command.id}`,
      "",
      `- source: ${command.source}`,
      `- target: ${command.target}`,
      `- kind: ${command.kind}`,
      `- createdAt: ${command.createdAt}`,
      "",
      "## Payload",
      "",
      "```json",
      JSON.stringify(command.payload, null, 2),
      "```",
      "",
      "## Contexto da fila",
      "",
      "```json",
      JSON.stringify(context.getQueueStats(), null, 2),
      "```",
      "",
      "## Instrucoes",
      "",
      "- Execute a tarefa de forma autonoma.",
      "- Se precisar editar arquivos do workspace, faca isso.",
      "- Este job usa OpenClaw como executor automatico do lado do Codex.",
      "- Ao terminar, a resposta final precisa seguir o schema JSON deste job.",
      "- O summary deve ser curto, direto e informal.",
    ].join("\n");
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["status", "summary", "details", "finishedAt"],
      properties: {
        status: { type: "string" },
        summary: { type: "string" },
        details: { type: "string" },
        finishedAt: { type: "string" },
      },
    };

    mkdirSync(jobDirectory, { recursive: true });
    writeFileSync(requestFile, requestBody, "utf-8");
    writeFileSync(schemaFile, JSON.stringify(schema, null, 2), "utf-8");

    return {
      provider: "codex",
      projectRoot,
      requestFile,
      responseFile,
      dispatchedAt: new Date().toISOString(),
      message: "Job entregue para o Codex via OpenClaw e bridge em arquivo.",
    };
  }

  private runOpenClaw(command: CommandRecord, external: ExternalDispatch) {
    const cli = this.resolveOpenClawCli();
    const workspace = process.env.OPENCLAW_WORKSPACE ?? process.env.CODEX_WORKSPACE ?? external.projectRoot ?? getTargetProjectRoot();
    const agentId = this.getAgentId();
    const model = process.env.OPENCLAW_MODEL ?? "openai-codex/gpt-5.4";
    const thinking = process.env.OPENCLAW_THINKING ?? "medium";
    const timeoutMs = Number(process.env.OPENCLAW_TIMEOUT_MS ?? 600000);

    if (!existsSync(workspace)) {
      throw new Error(`OpenClaw workspace not found: ${workspace}`);
    }

    this.ensureOpenClawAgent(cli, workspace, agentId, model);

    const prompt = [
      "Voce esta executando um job de integracao automatica.",
      `Leia o arquivo ${external.requestFile}.`,
      "Execute a tarefa de forma autonoma no workspace atual.",
      "Se precisar criar ou alterar arquivos, faca isso agora.",
      "No fim, responda somente com JSON valido.",
      "Use exatamente os campos status, summary, details e finishedAt.",
      "Nao use markdown, nao use crases, nao escreva texto fora do JSON.",
      "O summary deve ser curto, direto e informal.",
      `Job id: ${command.id}.`,
    ].join(" ");

    const result = this.runCli(
      cli,
      ["agent", "--local", "--json", "--agent", agentId, "--thinking", thinking, "--message", prompt],
      workspace,
      timeoutMs,
      10 * 1024 * 1024,
    );

    if (result.error) {
      throw new Error(`OpenClaw nao conseguiu rodar: ${result.error.message}`);
    }

    if (result.signal === "SIGTERM") {
      throw new Error(`OpenClaw excedeu o tempo limite de ${timeoutMs}ms.`);
    }

    if (typeof result.status === "number" && result.status !== 0) {
      throw new Error(`OpenClaw retornou status ${result.status}. stderr: ${result.stderr?.trim() ?? ""}`.trim());
    }

    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const envelopeRaw = stdout || stderr;

    if (!envelopeRaw) {
      throw new Error("OpenClaw nao retornou envelope JSON.");
    }

    const envelope = this.parseJsonOutput(envelopeRaw, "OpenClaw envelope");
    const payloadText = this.extractPayloadText(envelope);
    const response = this.parseJsonOutput(payloadText, "OpenClaw payload") as {
      status: string;
      summary: string;
      details: string;
      finishedAt: string;
    };

    if (!response.status || !response.summary || !response.details || !response.finishedAt) {
      throw new Error("OpenClaw respondeu sem todos os campos obrigatorios.");
    }

    return response;
  }

  private ensureOpenClawAgent(cli: string, workspace: string, agentId: string, model: string) {
    const agentDirectory = this.resolveAgentDirectory(agentId);
    const authFile = join(agentDirectory, "auth-profiles.json");

    if (existsSync(authFile)) {
      return;
    }

    const result = this.runCli(
      cli,
      ["agents", "add", agentId, "--non-interactive", "--workspace", workspace, "--model", model, "--json"],
      workspace,
      120000,
      5 * 1024 * 1024,
    );

    if (result.error) {
      throw new Error(`OpenClaw nao conseguiu preparar o agente ${agentId}: ${result.error.message}`);
    }

    if (typeof result.status === "number" && result.status !== 0) {
      throw new Error(`OpenClaw nao conseguiu preparar o agente ${agentId}. stderr: ${result.stderr?.trim() ?? ""}`.trim());
    }

    if (!existsSync(authFile)) {
      throw new Error(`OpenClaw criou o agente ${agentId}, mas o auth profile nao apareceu em ${authFile}.`);
    }
  }

  private getAgentId() {
    return process.env.OPENCLAW_AGENT ?? "codexbridge";
  }

  private resolveOpenClawCli() {
    if (process.env.OPENCLAW_CLI) {
      return process.env.OPENCLAW_CLI;
    }

    if (process.platform === "win32" && process.env.APPDATA) {
      const candidate = join(process.env.APPDATA, "npm", "openclaw.ps1");

      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return "openclaw";
  }

  private resolveAgentDirectory(agentId: string) {
    const openClawHome = process.env.OPENCLAW_STATE_DIR
      ?? (process.env.USERPROFILE ? join(process.env.USERPROFILE, ".openclaw") : undefined)
      ?? (process.env.HOME ? join(process.env.HOME, ".openclaw") : undefined);

    if (!openClawHome) {
      throw new Error("Nao foi possivel localizar a pasta de estado do OpenClaw.");
    }

    return join(openClawHome, "agents", agentId, "agent");
  }

  private extractPayloadText(envelope: unknown) {
    if (!envelope || typeof envelope !== "object") {
      throw new Error("OpenClaw retornou um envelope invalido.");
    }

    const payloads = (envelope as { payloads?: Array<{ text?: string }> }).payloads;
    const firstText = payloads?.find((item) => typeof item.text === "string")?.text?.trim();

    if (!firstText) {
      throw new Error("OpenClaw nao retornou texto util no payload.");
    }

    return firstText;
  }

  private parseJsonOutput(raw: string, label: string) {
    try {
      return JSON.parse(raw);
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");

      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch {}
      }
    }

    const preview = raw.substring(0, 500).replace(/\r?\n/g, "\\n");
    throw new Error(`${label} invalido. RAW: [${preview}]`);
  }

  private runCli(cli: string, args: string[], cwd: string, timeout: number, maxBuffer: number) {
    if (process.platform === "win32" && cli.toLowerCase().endsWith(".ps1")) {
      return spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-File", cli, ...args],
        {
          cwd,
          encoding: "utf-8",
          timeout,
          maxBuffer,
        },
      );
    }

    return spawnSync(
      cli,
      args,
      {
        cwd,
        encoding: "utf-8",
        timeout,
        maxBuffer,
        shell: process.platform === "win32",
      },
    );
  }
}
