import { Router } from "express";
import { IntegrationRuntime } from "../services/runtime";

export function createWorkerRouter(runtime: IntegrationRuntime) {
  const router = Router();

  router.post("/process", async (_req, res, next) => {
    try {
      const processed = await runtime.worker.processPending();
      const collected = await runtime.worker.collectExternalResults();
      res.json({
        processed,
        collected,
        stats: runtime.queue.getStats(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
