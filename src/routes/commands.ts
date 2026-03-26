import { Router } from "express";
import { commandRequestSchema } from "../core/schema";
import { IntegrationRuntime } from "../services/runtime";

export function createCommandRouter(runtime: IntegrationRuntime) {
  const router = Router();

  router.get("/", (req, res) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    res.json({
      items: runtime.queue
        .list()
        .filter((command) => !projectId || command.meta?.projectId === projectId),
    });
  });

  router.get("/:id", (req, res) => {
    const command = runtime.queue.getById(req.params.id);

    if (!command) {
      res.status(404).json({ error: "Command not found." });
      return;
    }

    res.json(command);
  });

  router.post("/", async (req, res, next) => {
    try {
      const parsed = commandRequestSchema.parse(req.body);
      const command = await runtime.acceptCommand(parsed);

      res.status(201).json(command);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
