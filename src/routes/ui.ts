import { Router } from "express";
import { uiDispatchSchema } from "../core/schema";
import { IntegrationRuntime } from "../services/runtime";

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
