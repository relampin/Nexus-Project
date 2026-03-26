import { existsSync, readFileSync } from "node:fs";
import { Router } from "express";
import { resolveNexusPath } from "../core/paths";
import { uiDispatchSchema } from "../core/schema";
import { IntegrationRuntime } from "../services/runtime";

function readBootstrapKitItem(id: string, title: string, relativePath: string, kind: "doc" | "prompt") {
  const absolutePath = resolveNexusPath(...relativePath.split(/[\\/]/));
  const exists = existsSync(absolutePath);

  return {
    id,
    title,
    kind,
    relativePath,
    absolutePath,
    exists,
    content: exists ? readFileSync(absolutePath, "utf-8") : "",
  };
}

export function createUiRouter(runtime: IntegrationRuntime) {
  const router = Router();

  router.get("/bootstrap", (_req, res) => {
    res.json(runtime.getUiSnapshot());
  });

  router.get("/commands", (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    res.json({
      items: runtime.listUiCommands(status, limit),
    });
  });

  router.get("/commands/:id", (req, res) => {
    const command = runtime.getUiCommand(req.params.id);

    if (!command) {
      res.status(404).json({ error: "Command not found." });
      return;
    }

    res.json(command);
  });

  router.get("/activity", (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    res.json({
      items: runtime.logger.readRecentEntries(limit),
    });
  });

  router.get("/bootstrap-kit", (_req, res) => {
    const items = [
      readBootstrapKitItem("canonical", "Arquitetura Canonica", "docs/NEXUS-CANONICAL.md", "doc"),
      readBootstrapKitItem("setup", "Setup em Outra Maquina", "docs/SETUP-OUTRA-MAQUINA.md", "doc"),
      readBootstrapKitItem("codex", "Prompt Base do Codex", "docs/prompts/CODEX-BOOTSTRAP.md", "prompt"),
      readBootstrapKitItem("antigravity", "Prompt Base do Antigravity", "docs/prompts/ANTIGRAVITY-BOOTSTRAP.md", "prompt"),
    ];

    res.json({
      generatedAt: new Date().toISOString(),
      items,
    });
  });

  router.get("/manual-assist", (_req, res) => {
    res.json(runtime.getUiSnapshot().manualAssist);
  });

  router.get("/antigravity/session", (req, res) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;

    res.json(runtime.antigravityMonitor.getSnapshot(projectId));
  });

  router.get("/antigravity/session/:jobId", (req, res) => {
    const evidence = runtime.antigravityMonitor.getJobEvidence(req.params.jobId);

    if (!evidence) {
      res.status(404).json({ error: "Antigravity session evidence not found." });
      return;
    }

    res.json(evidence);
  });

  router.post("/dispatch", async (req, res, next) => {
    try {
      const parsed = uiDispatchSchema.parse(req.body);
      const text = parsed.text ?? parsed.payload?.text;

      if (!text) {
        res.status(400).json({ error: "Text is required." });
        return;
      }

      const command = await runtime.acceptCommand({
        source: parsed.source === "user" ? "system" : parsed.source,
        target: parsed.target,
        kind: parsed.kind,
        payload: {
          text,
        },
        meta: {
          channel: "ui",
          projectId: parsed.projectId,
        },
      });

      void runtime.worker.processPending();
      res.status(201).json(runtime.getUiCommand(command.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendSnapshot = () => {
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify(runtime.getUiSnapshot())}\n\n`);
    };

    sendSnapshot();

    const timer = setInterval(sendSnapshot, 2000);

    req.on("close", () => {
      clearInterval(timer);
      res.end();
    });
  });

  return router;
}
