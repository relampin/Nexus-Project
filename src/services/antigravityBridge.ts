import { AntigravityCdpBridge } from "./antigravityCdp";
import { buildGuardrailAlertPrompt } from "./antigravityGuard";
import { buildAntigravityIdePrompt } from "./antigravityPrompt";
import { IntegrationRuntime } from "./runtime";

export class AntigravityBridge {
  private syncTimer?: NodeJS.Timeout;
  private readonly cdp = new AntigravityCdpBridge();

  constructor(private readonly runtime: IntegrationRuntime) {}

  start() {
    this.syncTimer = setInterval(() => {
      void this.dispatchPendingJobs();
      void this.monitorGuardrails();
      void this.monitorSession();
    }, Number(process.env.ANTIGRAVITY_SYNC_INTERVAL_MS ?? 3000));

    console.log("[AntigravityBridge] Ponte local via CDP/manual ativa.");
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  private async dispatchPendingJobs() {
    for (const command of this.runtime.listPendingAntigravityDelegations()) {
      if (command.target !== "antigravity") {
        continue;
      }

      if (command.meta?.delivery?.promptInjectedAt) {
        continue;
      }

      try {
        await this.cdp.injectPrompt(buildAntigravityIdePrompt(command));
        this.runtime.markAntigravityPromptInjected(command.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao injetar prompt no Antigravity.";
        console.log(`[AntigravityBridge] CDP indisponivel para o job ${command.id}: ${message}`);
      }
    }
  }

  private async monitorGuardrails() {
    for (const command of this.runtime.listPendingAntigravityDelegations()) {
      if (command.target !== "antigravity" || command.meta?.guardrail?.alertInjectedAt) {
        continue;
      }

      const inspection = this.runtime.inspectAntigravityGuardrails(command);

      if (!inspection || inspection.violatingFiles.length === 0) {
        continue;
      }

      this.runtime.logger.logGuardrailViolation(command, inspection.violatingFiles);

      try {
        await this.cdp.injectPrompt(buildGuardrailAlertPrompt(command, inspection.violatingFiles));
        this.runtime.markGuardrailAlerted(command.id, inspection.violatingFiles);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao alertar guardrail do Antigravity.";
        console.log(`[AntigravityBridge] Falha ao alertar guardrail no job ${command.id}: ${message}`);
      }
    }
  }

  private async monitorSession() {
    const commands = this.runtime
      .listPendingAntigravityDelegations()
      .filter((command) => command.target === "antigravity");

    await this.runtime.antigravityMonitor.sample(commands);
  }
}
