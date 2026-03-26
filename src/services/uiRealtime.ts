import { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { IntegrationRuntime } from "./runtime";

type RealtimeMessage =
  | {
      type: "hello";
      transport: "websocket";
      connectedAt: string;
    }
  | {
      type: "snapshot";
      transport: "websocket";
      data: ReturnType<IntegrationRuntime["getUiSnapshot"]>;
      projectId?: string;
      sentAt: string;
    }
  | {
      type: "antigravity.session";
      transport: "websocket";
      data: ReturnType<IntegrationRuntime["antigravityMonitor"]["getSnapshot"]>;
      projectId?: string;
      sentAt: string;
    }
  | {
      type: "ack";
      transport: "websocket";
      action: string;
      sentAt: string;
    }
  | {
      type: "error";
      transport: "websocket";
      message: string;
      sentAt: string;
    }
  | {
      type: "pong";
      transport: "websocket";
      sentAt: string;
    };

interface ClientState {
  watchProjectId?: string;
}

interface ClientCommand {
  type?: string;
  projectId?: string;
}

export class UiRealtimeBridge {
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, ClientState>();
  private broadcastTimer?: NodeJS.Timeout;

  constructor(
    server: HttpServer,
    private readonly runtime: IntegrationRuntime,
  ) {
    this.wss = new WebSocketServer({
      server,
      path: "/ui/ws",
    });
  }

  start() {
    this.wss.on("connection", (socket) => {
      this.clients.set(socket, {});
      this.send(socket, {
        type: "hello",
        transport: "websocket",
        connectedAt: new Date().toISOString(),
      });
      this.sendSnapshot(socket);

      socket.on("message", (buffer) => {
        void this.handleMessage(socket, String(buffer));
      });

      socket.on("close", () => {
        this.clients.delete(socket);
      });

      socket.on("error", () => {
        this.clients.delete(socket);
      });
    });

    this.broadcastTimer = setInterval(() => {
      this.broadcastSnapshots();
    }, 2000);
  }

  stop() {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = undefined;
    }

    for (const socket of this.clients.keys()) {
      socket.close();
    }

    this.clients.clear();
    this.wss.close();
  }

  private async handleMessage(socket: WebSocket, raw: string) {
    let command: ClientCommand;

    try {
      command = JSON.parse(raw) as ClientCommand;
    } catch {
      this.send(socket, {
        type: "error",
        transport: "websocket",
        message: "Mensagem invalida no canal realtime do Nexus.",
        sentAt: new Date().toISOString(),
      });
      return;
    }

    const state = this.clients.get(socket);

    switch (command.type) {
      case "ping":
        this.send(socket, {
          type: "pong",
          transport: "websocket",
          sentAt: new Date().toISOString(),
        });
        return;
      case "snapshot.request":
        this.sendSnapshot(socket);
        return;
      case "project.watch":
        if (state) {
          state.watchProjectId = command.projectId;
        }
        this.send(socket, {
          type: "ack",
          transport: "websocket",
          action: "project.watch",
          sentAt: new Date().toISOString(),
        });
        this.sendSnapshot(socket);
        return;
      case "antigravity.sample":
        await this.runtime.sampleAntigravitySession(command.projectId ?? state?.watchProjectId);
        this.sendAntigravitySession(socket);
        this.sendSnapshot(socket);
        return;
      default:
        this.send(socket, {
          type: "error",
          transport: "websocket",
          message: `Acao realtime nao suportada: ${command.type ?? "undefined"}.`,
          sentAt: new Date().toISOString(),
        });
    }
  }

  private broadcastSnapshots() {
    for (const socket of this.clients.keys()) {
      this.sendSnapshot(socket);
    }
  }

  private sendSnapshot(socket: WebSocket) {
    const client = this.clients.get(socket);
    const snapshot = this.runtime.getUiSnapshot();
    const projectId = client?.watchProjectId ?? snapshot.activeProjectId;

    this.send(socket, {
      type: "snapshot",
      transport: "websocket",
      data: snapshot,
      projectId,
      sentAt: new Date().toISOString(),
    });
  }

  private sendAntigravitySession(socket: WebSocket) {
    const client = this.clients.get(socket);
    const projectId = client?.watchProjectId;

    this.send(socket, {
      type: "antigravity.session",
      transport: "websocket",
      data: this.runtime.antigravityMonitor.getSnapshot(projectId),
      projectId,
      sentAt: new Date().toISOString(),
    });
  }

  private send(socket: WebSocket, payload: RealtimeMessage) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(payload));
  }
}
