import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { CommandRecord, CommandRequest, QueueStats } from "./types";
import { resolveNexusPath } from "./paths";
import { JsonFileStore } from "./storage";

interface QueueState {
  commands: CommandRecord[];
}

const initialState: QueueState = { commands: [] };

export class PersistentQueue {
  private readonly store = new JsonFileStore<QueueState>(resolveNexusPath("data", "queue.json"), initialState);

  private readState() {
    return this.store.read();
  }

  private writeState(state: QueueState) {
    this.store.write(state);
  }

  enqueue(command: CommandRequest) {
    const state = this.readState();
    const now = new Date().toISOString();

    const record: CommandRecord = {
      ...command,
      id: uuidv4(),
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    state.commands.push(record);
    this.writeState(state);
    return record;
  }

  list() {
    return this.readState().commands.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getById(id: string) {
    return this.readState().commands.find((command) => command.id === id);
  }

  getNextPending() {
    return this.readState().commands.find((command) => command.status === "pending");
  }

  update(id: string, updater: (command: CommandRecord) => CommandRecord) {
    const state = this.readState();
    const index = state.commands.findIndex((command) => command.id === id);

    if (index === -1) {
      return undefined;
    }

    state.commands[index] = updater(state.commands[index]);
    this.writeState(state);
    return state.commands[index];
  }

  markProcessing(id: string) {
    return this.update(id, (command) => ({
      ...command,
      status: "processing",
      attempts: command.attempts + 1,
      updatedAt: new Date().toISOString(),
    }));
  }

  markCompleted(id: string, result: unknown) {
    return this.update(id, (command) => ({
      ...command,
      status: "completed",
      result,
      error: undefined,
      updatedAt: new Date().toISOString(),
    }));
  }

  markAwaitingExternal(id: string, external: CommandRecord["external"]) {
    return this.update(id, (command) => ({
      ...command,
      status: "awaiting_external",
      external,
      error: undefined,
      updatedAt: new Date().toISOString(),
    }));
  }

  markFailed(id: string, error: string) {
    return this.update(id, (command) => ({
      ...command,
      status: "failed",
      error,
      updatedAt: new Date().toISOString(),
    }));
  }

  getStats(): QueueStats {
    const commands = this.readState().commands;

    return {
      total: commands.length,
      pending: commands.filter((item) => item.status === "pending").length,
      processing: commands.filter((item) => item.status === "processing").length,
      awaitingExternal: commands.filter((item) => item.status === "awaiting_external").length,
      completed: commands.filter((item) => item.status === "completed").length,
      failed: commands.filter((item) => item.status === "failed").length,
    };
  }
}
