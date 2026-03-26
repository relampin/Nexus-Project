import { AntigravityAdapter } from "../adapters/antigravityAdapter";
import { CodexAdapter } from "../adapters/codexAdapter";
import { AdapterContext, AgentAdapter, AgentName, CommandRecord } from "../core/types";

export class Orchestrator {
  private readonly adapters = new Map<AgentName, AgentAdapter>();

  constructor() {
    const antigravity = new AntigravityAdapter();
    const codex = new CodexAdapter();

    this.adapters.set(antigravity.name, antigravity);
    this.adapters.set(codex.name, codex);
  }

  async dispatch(command: CommandRecord, context: AdapterContext) {
    const adapter = this.adapters.get(command.target);

    if (!adapter) {
      throw new Error(`No adapter registered for target ${command.target}.`);
    }

    return adapter.execute(command, context);
  }
}
