import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./server";
import { UiRealtimeBridge } from "./services/uiRealtime";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
const server = createServer(app);
const realtime = new UiRealtimeBridge(server, app.locals.runtime);

realtime.start();

const shutdown = () => {
  try {
    realtime.stop();
  } catch {
    // Ignoramos erros de encerramento para nao travar o stop do processo.
  }

  try {
    app.locals.shutdown?.();
  } catch {
    // O runtime cuida do cleanup interno; se algo falhar aqui, seguimos fechando o servidor.
  }

  server.close(() => {
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

server.listen(port, () => {
  console.log(`Nexus portatil ativo em http://localhost:${port}`);
  console.log(`Painel do Nexus em http://localhost:${port}/app`);
  console.log(`Frontend do projeto alvo em http://localhost:${port}/project-app`);
  console.log(`Canal realtime do Nexus em ws://localhost:${port}/ui/ws`);
});
