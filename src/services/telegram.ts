import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import TelegramBot = require("node-telegram-bot-api");
import { AgentName, CommandRecord } from "../core/types";
import { resolveNexusPath } from "../core/paths";
import { AntigravityCdpBridge } from "./antigravityCdp";
import { buildGuardrailAlertPrompt, inspectAntigravityGuardrails } from "./antigravityGuard";
import { buildAntigravityIdePrompt, buildAntigravityTelegramMessage } from "./antigravityPrompt";
import { IntegrationRuntime } from "./runtime";

interface RelayRequest {
  sender: AgentName;
  target: "antigravity" | "codex";
  text: string;
  kind?: CommandRecord["kind"];
  replyChatId?: number;
  delegatedBy?: AgentName;
}

export class TelegramBridge {
  private bot: TelegramBot | null = null;
  private syncTimer?: NodeJS.Timeout;
  private state = this.readState();
  private readonly antigravityCdp = new AntigravityCdpBridge();

  constructor(private readonly runtime: IntegrationRuntime) {}

  start() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    this.syncTimer = setInterval(() => {
      void this.dispatchPendingAntigravityJobs();
      void this.monitorAntigravityJobs();
      void this.monitorAntigravitySession();
      void this.notifyFinishedCommands();
    }, Number(process.env.TELEGRAM_SYNC_INTERVAL_MS ?? 3000));

    if (!token) {
      console.log("[Telegram] TELEGRAM_BOT_TOKEN nao configurado. Chat inativo, mas CDP e monitor local seguem ativos.");
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });
    this.bot.on("message", (msg) => {
      void this.handleInboundMessage(msg);
    });

    this.bot.onText(/\/status/, (msg) => {
      void this.sendStatus(msg.chat.id);
    });

    console.log("[Telegram] Ponte principal ativa.");
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    if (this.bot) {
      this.bot.stopPolling();
      this.bot = null;
    }
  }

  async relay(request: RelayRequest) {
    const command = await this.runtime.acceptCommand({
      source: request.sender,
      target: request.target,
      kind: request.kind ?? "task",
      payload: {
        text: request.text,
      },
      meta: {
        channel: "telegram",
        delegatedBy: request.delegatedBy,
        telegram: {
          replyChatId: request.replyChatId,
        },
      },
    });

    return command;
  }

  private async handleInboundMessage(msg: TelegramBot.Message) {
    const text = msg.text?.trim();

    if (!text || text.startsWith("/status")) {
      return;
    }

    const chatId = msg.chat.id;
    const antigravityChatId = this.getAntigravityChatId();

    if (/^(\/ag_register|AG_REGISTER)$/i.test(text)) {
      this.state.antigravityChatId = chatId;
      this.writeState();
      await this.sendMessage(chatId, `✅ Chat do Antigravity registrado com sucesso.\nID: ${chatId}`);
      return;
    }

    if (/^(\/chatid|CHAT_ID)$/i.test(text)) {
      await this.sendMessage(chatId, `🧭 Chat ID atual: ${chatId}`);
      return;
    }

    if (antigravityChatId !== undefined && chatId === antigravityChatId && !this.isExplicitCommand(text)) {
      const handled = await this.tryHandleAntigravityResult(text);

      if (handled) {
        return;
      }
    }

    if (!this.isAllowedInboundChat(chatId)) {
      return;
    }

    const target = this.resolveTarget(text);
    const payloadText = this.stripTargetPrefix(text, target);
    const command = await this.runtime.acceptCommand({
      source: "system",
      target,
      kind: "task",
      payload: {
        text: payloadText,
      },
      meta: {
        channel: "telegram",
        telegram: {
          replyChatId: chatId,
          inboundMessageId: msg.message_id,
        },
      },
    });

    await this.sendMessage(chatId, `⏳ Job recebido e enviado para ${target.toUpperCase()}.\nID: ${command.id}`);
  }

  private async tryHandleAntigravityResult(text: string) {
    const success = text.match(/^AG_RESULT\s+([a-f0-9-]+)\s*\|\s*(.+)$/i);

    if (success) {
      const [, id, summary] = success;
      this.ensureAntigravityLog(id, summary.trim());
      this.runtime.completeExternalTelegramCommand(id, "antigravity", summary.trim(), `Resultado do Antigravity via Telegram.`);
      return true;
    }

    const failure = text.match(/^AG_FAIL\s+([a-f0-9-]+)\s*\|\s*(.+)$/i);

    if (failure) {
      const [, id, error] = failure;
      this.runtime.failExternalTelegramCommand(id, error.trim());
      return true;
    }

    const pending = this.runtime.listPendingTelegramDelegations().find((command) => command.target === "antigravity");

    if (!pending) {
      return false;
    }

    if (this.looksLikeFailure(text)) {
      this.runtime.failExternalTelegramCommand(pending.id, text.trim());
      return true;
    }

    this.ensureAntigravityLog(pending.id, text.trim());
    this.runtime.completeExternalTelegramCommand(pending.id, "antigravity", text.trim(), "Resultado natural do Antigravity via Telegram.");
    return true;
  }

  private async dispatchPendingAntigravityJobs() {
    for (const command of this.runtime.listPendingTelegramDelegations()) {
      if (command.target !== "antigravity") {
        continue;
      }

      const targetChatId = this.getAntigravityChatId();

      if (this.bot && targetChatId !== undefined && !command.meta?.telegram?.relaySentAt) {
        const telegramMessage = buildAntigravityTelegramMessage(command);
        const sent = await this.sendMessage(targetChatId, telegramMessage);

        if (sent) {
          this.runtime.markTelegramRelaySent(command.id, targetChatId);
        }
      }

      if (!command.meta?.telegram?.promptInjectedAt) {
        try {
          await this.antigravityCdp.injectPrompt(buildAntigravityIdePrompt(command));
          this.runtime.markTelegramPromptInjected(command.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha ao injetar prompt no Antigravity.";
          console.log(`[Telegram] CDP do Antigravity indisponivel para o job ${command.id}: ${message}`);
        }
      }
    }
  }

  private async notifyFinishedCommands() {
    if (!this.bot) {
      return;
    }

    for (const command of this.runtime.queue.list()) {
      const replyChatId = command.meta?.telegram?.replyChatId;

      if (!replyChatId || command.meta?.telegram?.statusNotifiedAt) {
        continue;
      }

      if (command.status !== "completed" && command.status !== "failed") {
        continue;
      }

      if (command.status === "completed") {
        const summary = this.resolveSummary(command);
        const sent = await this.sendMessage(replyChatId, `✅ ${summary}`);

        if (sent) {
          this.runtime.markTelegramStatusNotified(command.id);
        }
      } else {
        const sent = await this.sendMessage(replyChatId, `❌ ${command.error ?? "deu ruim e eu ainda nao tenho detalhes melhores."}`);

        if (sent) {
          this.runtime.markTelegramStatusNotified(command.id);
        }
      }
    }
  }

  private async monitorAntigravityJobs() {
    for (const command of this.runtime.listPendingTelegramDelegations()) {
      if (command.target !== "antigravity" || command.meta?.guardrail?.alertInjectedAt) {
        continue;
      }

      const inspection = inspectAntigravityGuardrails(command);

      if (!inspection || inspection.violatingFiles.length === 0) {
        continue;
      }

      this.runtime.logger.logGuardrailViolation(command, inspection.violatingFiles);

      try {
        await this.antigravityCdp.injectPrompt(buildGuardrailAlertPrompt(command, inspection.violatingFiles));
        this.runtime.markGuardrailAlerted(command.id, inspection.violatingFiles);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao alertar guardrail do Antigravity.";
        console.log(`[Telegram] Falha ao alertar guardrail no job ${command.id}: ${message}`);
      }
    }
  }

  private async monitorAntigravitySession() {
    const commands = this.runtime
      .listPendingTelegramDelegations()
      .filter((command) => command.target === "antigravity");

    await this.runtime.antigravityMonitor.sample(commands);
  }

  private resolveSummary(command: CommandRecord) {
    const result = command.result as
      | { message?: string; data?: { response?: { summary?: string } } }
      | undefined;

    return result?.message
      ?? result?.data?.response?.summary
      ?? `${command.target} terminou o job ${command.id}.`;
  }

  private async sendStatus(chatId: number) {
    const stats = this.runtime.queue.getStats();
    await this.sendMessage(
      chatId,
      [
        "📊 Status do orquestrador",
        `Pendentes: ${stats.pending}`,
        `Processando: ${stats.processing}`,
        `Aguardando agente: ${stats.awaitingExternal}`,
        `Concluidos: ${stats.completed}`,
        `Falhas: ${stats.failed}`,
        `Total: ${stats.total}`,
      ].join("\n"),
    );
  }

  private resolveTarget(text: string): "antigravity" | "codex" {
    const lowered = text.toLowerCase();

    if (lowered.startsWith("!ag ") || lowered.startsWith("/ag ")) {
      return "antigravity";
    }

    return "codex";
  }

  private stripTargetPrefix(text: string, target: "antigravity" | "codex") {
    if (target === "antigravity") {
      return text.replace(/^(!ag|\/ag)\s+/i, "").trim();
    }

    return text.replace(/^(!codex|\/codex)\s+/i, "").trim();
  }

  private isAllowedInboundChat(chatId: number) {
    const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;

    if (!allowedChatId) {
      return true;
    }

    return Number(allowedChatId) === chatId;
  }

  private isExplicitCommand(text: string) {
    return /^\/status$/i.test(text)
      || /^(\/ag_register|AG_REGISTER)$/i.test(text)
      || /^(\/chatid|CHAT_ID)$/i.test(text)
      || /^(!ag|\/ag)\s+/i.test(text)
      || /^(!codex|\/codex)\s+/i.test(text);
  }

  private looksLikeFailure(text: string) {
    return /^(erro|falhou|falha|nao consegui|não consegui|deu ruim|fail)/i.test(text.trim());
  }

  private ensureAntigravityLog(id: string, summary: string) {
    const command = this.runtime.getUiCommand(id);
    const logFile = command?.external?.logFile;
    const projectRoot = command?.external?.projectRoot ?? this.runtime.projects.getProjectRoot(command?.meta?.projectId);

    if (!logFile) {
      return;
    }

    if (existsSync(logFile)) {
      return;
    }

    mkdirSync(join(projectRoot, "log"), { recursive: true });
    writeFileSync(
      logFile,
      [
        "## O que recebi",
        command?.text ?? "sem texto",
        "",
        "## Objetivo",
        "Concluir o job conforme o request do Nexus.",
        "",
        "## Arquivos inspecionados",
        "nao informado via Telegram",
        "",
        "## Arquivos alterados",
        "nao informado via Telegram",
        "",
        "## O que fiz",
        summary,
        "",
        "## O que deleguei",
        "nada",
        "",
        "## O que falta validar",
        "nao informado via Telegram",
      ].join("\n"),
      "utf-8",
    );
  }

  private getAntigravityChatId() {
    const raw = process.env.TELEGRAM_ANTIGRAVITY_CHAT_ID;
    return raw ? Number(raw) : this.state.antigravityChatId;
  }

  private async sendMessage(chatId: number, text: string) {
    if (!this.bot) {
      return false;
    }

    try {
      await this.bot.sendMessage(chatId, text);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      console.error(`[Telegram] Falha ao enviar mensagem para o chat ${chatId}: ${message}`);
      return false;
    }
  }

  private readState(): { antigravityChatId?: number } {
    const file = resolveNexusPath("data", "telegram-state.json");

    try {
      return JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      return {};
    }
  }

  private writeState() {
    const directory = resolveNexusPath("data");
    const file = join(directory, "telegram-state.json");
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, `${JSON.stringify(this.state, null, 2)}\n`, "utf-8");
  }
}
