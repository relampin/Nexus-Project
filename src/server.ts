import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createCommandRouter } from "./routes/commands";
import { createDiagnosticsRouter } from "./routes/diagnostics";
import { resolveNexusPath, getTargetProjectRoot } from "./core/paths";
import { createProjectsRouter } from "./routes/projects";
import { createStoreRouter } from "./routes/store";
import { createTelegramRouter } from "./routes/telegram";
import { createUiRouter } from "./routes/ui";
import { createWorkerRouter } from "./routes/worker";
import { IntegrationRuntime } from "./services/runtime";
import { TelegramBridge } from "./services/telegram";

export function createApp() {
  const app = express();
  const runtime = new IntegrationRuntime();
  const telegram = new TelegramBridge(runtime);
  const nexusFrontendDirectory = resolveNexusPath("frontend");
  const getTargetProjectFrontendDirectory = () => join(getTargetProjectRoot(), "frontend");
  const getStoreFrontendDirectory = () => join(getTargetProjectRoot(), "frontend", "store");

  runtime.start();
  telegram.start();
  app.locals.runtime = runtime;
  app.locals.telegram = telegram;
  app.locals.shutdown = () => {
    runtime.stop();
    telegram.stop();
  };

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.use(express.json());
  app.use("/app", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  app.get("/health", (_req, res) => {
    const activeProject = runtime.projects.getActiveProject();
    const audit = runtime.getAuditReport();
    const visibleQueue = runtime.getUiSnapshot().stats;
    const activeProjectId = activeProject?.project.id;
    const validation = activeProjectId ? runtime.getProjectValidation(activeProjectId) : null;
    const git = activeProjectId ? runtime.getProjectGit(activeProjectId) : null;
    const profile = activeProjectId ? runtime.getProjectSnapshot(activeProjectId)?.profile ?? null : null;

    res.json({
      status: "ok",
      service: "nexus-portatil",
      queue: visibleQueue,
      activeProject: activeProject?.project ?? null,
      activeProjectProfile: profile,
      activeProjectRoot: activeProject ? runtime.projects.getProjectRoot(activeProject.project.id) : getTargetProjectRoot(),
      validation,
      git,
      antigravitySession: runtime.antigravityMonitor.getHealthSummary(),
      audit: runtime.audit.getLatestSummary() ?? {
        status: audit.status,
        generatedAt: audit.generatedAt,
        findings: audit.findings,
        highlights: audit.highlights,
        invalidatedCommands: audit.invalidatedCommands,
      },
      targetProjectRoot: getTargetProjectRoot(),
      now: new Date().toISOString(),
    });
  });

  app.use("/commands", createCommandRouter(runtime));
  app.use("/diagnostics", createDiagnosticsRouter(runtime));
  app.use("/projects", createProjectsRouter(runtime));
  app.use("/store-api", createStoreRouter());
  app.use("/telegram", createTelegramRouter(telegram));
  app.use("/ui", createUiRouter(runtime));
  app.use("/worker", createWorkerRouter(runtime));
  app.use("/app", express.static(nexusFrontendDirectory, {
    index: false,
    redirect: false,
  }));
  app.use("/project-app", (req, res, next) =>
    express.static(getTargetProjectFrontendDirectory(), {
      index: false,
      redirect: false,
    })(req, res, next));
  app.use("/store-app", (req, res, next) =>
    express.static(getStoreFrontendDirectory(), {
      index: false,
      redirect: false,
    })(req, res, next));

  app.get("/app", (_req, res) => {
    const indexPath = join(nexusFrontendDirectory, "index.html");
    if (existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(indexPath);
    } else {
      res.json({
        status: "frontend_not_ready",
        message: "O backend do Nexus esta pronto, mas o frontend do painel ainda nao foi gerado.",
        expectedDirectory: nexusFrontendDirectory,
        uiBootstrap: "/ui/bootstrap",
      });
    }
  });

  app.get("/app/", (_req, res) => {
    const indexPath = join(nexusFrontendDirectory, "index.html");
    if (existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(indexPath);
      return;
    }

    res.redirect("/app");
  });

  app.get("/project-app", (_req, res) => {
    const targetProjectFrontendDirectory = getTargetProjectFrontendDirectory();
    const indexPath = join(targetProjectFrontendDirectory, "index.html");
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
      return;
    }

    res.json({
      status: "project_frontend_not_ready",
      message: "O projeto alvo nao possui frontend em /frontend.",
      expectedDirectory: targetProjectFrontendDirectory,
    });
  });

  app.get("/store-app", (_req, res) => {
    const storeFrontendDirectory = getStoreFrontendDirectory();
    const indexPath = join(storeFrontendDirectory, "index.html");
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
      return;
    }

    res.json({
      status: "store_frontend_not_ready",
      message: "O frontend da loja ainda nao foi criado em /frontend/store.",
      expectedDirectory: storeFrontendDirectory,
      apiBaseUrl: "/store-api",
    });
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      error: error.message,
    });
  });

  return app;
}
