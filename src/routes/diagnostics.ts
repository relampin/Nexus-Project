import { Router } from "express";
import { IntegrationRuntime } from "../services/runtime";

export function createDiagnosticsRouter(runtime: IntegrationRuntime) {
  const router = Router();

  router.get("/audit", (_req, res) => {
    res.json(runtime.getAuditReport());
  });

  router.post("/audit/run", (_req, res) => {
    res.json(runtime.getAuditReport(true));
  });

  return router;
}
