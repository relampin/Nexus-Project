import { NextFunction, Response, Router } from "express";
import {
  createMilestoneSchema,
  createProjectSchema,
  createTaskSchema,
  setActiveProjectSchema,
  updateSummaryAudioStatusSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateTaskSchema,
} from "../projects/schema";
import { IntegrationRuntime } from "../services/runtime";
import { buildTaskExecutionPrompt } from "../services/taskDispatch";

export function createProjectsRouter(runtime: IntegrationRuntime) {
  const router = Router();

  const handleProjectError = (error: unknown, res: Response, next: NextFunction) => {
    if (error instanceof Error && error.message.startsWith("Projeto não encontrado")) {
      res.status(404).json({ error: "Projeto não encontrado." });
      return;
    }

    if (error instanceof Error && error.message.startsWith("Project root não encontrado")) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof Error && error.message.includes("Arquivo fora do escopo")) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof Error && error.message.includes("pasta real")) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  };

  router.get("/", (_req, res) => {
    res.json(runtime.getProjectsOverview());
  });

  router.post("/", (req, res, next) => {
    try {
      const parsed = createProjectSchema.parse(req.body);
      const created = runtime.projects.createProject(parsed);
      res.status(201).json(runtime.getProjectSnapshot(created.project.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/active", (_req, res) => {
    res.json(runtime.getActiveProjectSnapshot());
  });

  router.put("/active", (req, res, next) => {
    try {
      const parsed = setActiveProjectSchema.parse(req.body);
      const updated = runtime.projects.setActiveProject(parsed.projectId);

      if (!updated) {
        res.status(404).json({ error: "Projeto não encontrado." });
        return;
      }

      res.json(runtime.getProjectSnapshot(updated.project.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId", (req, res) => {
    const snapshot = runtime.getProjectSnapshot(req.params.projectId);

    if (!snapshot) {
      res.status(404).json({ error: "Projeto não encontrado." });
      return;
    }

    res.json(snapshot);
  });

  router.post("/:projectId/rescan", (req, res, next) => {
    try {
      const updated = runtime.projects.rescanProject(req.params.projectId);
      runtime.projectFiles.invalidate(req.params.projectId);
      res.json(runtime.getProjectSnapshot(updated.project.id));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.patch("/:projectId", (req, res, next) => {
    try {
      const parsed = updateProjectSchema.parse(req.body);
      const updated = runtime.projects.updateProject(req.params.projectId, parsed);

      if (!updated) {
        res.status(404).json({ error: "Projeto não encontrado." });
        return;
      }

      res.json(runtime.getProjectSnapshot(updated.project.id));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId", (req, res) => {
    const removed = runtime.projects.deleteProject(req.params.projectId);

    if (!removed) {
      res.status(404).json({ error: "Projeto não encontrado." });
      return;
    }

    res.json({
      removed: removed.project,
      activeProject: runtime.projects.getActiveProject()?.project ?? null,
    });
  });

  router.get("/:projectId/tasks", (req, res, next) => {
    try {
      res.json({
        items: runtime.projects.listTasks(req.params.projectId),
        agenda: runtime.projects.buildAgenda(req.params.projectId),
      });
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.post("/:projectId/tasks", (req, res, next) => {
    try {
      const parsed = createTaskSchema.parse(req.body);
      const task = runtime.projects.createTask(req.params.projectId, parsed);
      res.status(201).json(task);
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.patch("/:projectId/tasks/:taskId", (req, res, next) => {
    try {
      const parsed = updateTaskSchema.parse(req.body);
      const task = runtime.projects.updateTask(req.params.projectId, req.params.taskId, parsed);

      if (!task) {
        res.status(404).json({ error: "Tarefa não encontrada." });
        return;
      }

      res.json(task);
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.delete("/:projectId/tasks/:taskId", (req, res, next) => {
    try {
      const removed = runtime.projects.deleteTask(req.params.projectId, req.params.taskId);

      if (!removed) {
        res.status(404).json({ error: "Tarefa não encontrada." });
        return;
      }

      res.json(removed);
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.post("/:projectId/tasks/:taskId/send-to-agent", async (req, res, next) => {
    try {
      const snapshot = runtime.getProjectSnapshot(req.params.projectId);

      if (!snapshot) {
        res.status(404).json({ error: "Projeto não encontrado." });
        return;
      }

      const task = runtime.projects.getTask(req.params.projectId, req.params.taskId);

      if (!task) {
        res.status(404).json({ error: "Tarefa não encontrada." });
        return;
      }

      if (task.status === "completed") {
        res.status(400).json({ error: "Essa tarefa já foi concluída." });
        return;
      }

      const dispatchTask = task.status === "pending"
        ? runtime.projects.updateTask(req.params.projectId, req.params.taskId, {
          status: "in_progress",
        }) ?? task
        : task;

      const command = await runtime.acceptCommand({
        source: "system",
        target: "codex",
        kind: "task",
        payload: {
          text: buildTaskExecutionPrompt(snapshot, dispatchTask),
        },
        meta: {
          channel: "ui",
          projectId: req.params.projectId,
          taskId: dispatchTask.id,
          taskTitle: dispatchTask.title,
          initiatedFrom: "agenda",
        },
      });

      void runtime.worker.processPending();
      res.status(201).json(runtime.getUiCommand(command.id));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.get("/:projectId/milestones", (req, res, next) => {
    try {
      res.json({
        items: runtime.projects.listMilestones(req.params.projectId),
      });
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.post("/:projectId/milestones", (req, res, next) => {
    try {
      const parsed = createMilestoneSchema.parse(req.body);
      const milestone = runtime.projects.createMilestone(req.params.projectId, parsed);
      res.status(201).json(milestone);
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.patch("/:projectId/milestones/:milestoneId", (req, res, next) => {
    try {
      const parsed = updateMilestoneSchema.parse(req.body);
      const milestone = runtime.projects.updateMilestone(req.params.projectId, req.params.milestoneId, parsed);

      if (!milestone) {
        res.status(404).json({ error: "Marco não encontrado." });
        return;
      }

      res.json(milestone);
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.delete("/:projectId/milestones/:milestoneId", (req, res, next) => {
    try {
      const removed = runtime.projects.deleteMilestone(req.params.projectId, req.params.milestoneId);

      if (!removed) {
        res.status(404).json({ error: "Marco não encontrado." });
        return;
      }

      res.json(removed);
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.get("/:projectId/logs", (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? 100);
      res.json({
        items: runtime.listProjectLogs(req.params.projectId, limit),
        report: runtime.getProjectLogReport(req.params.projectId),
      });
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.get("/:projectId/dashboard", (req, res) => {
    const snapshot = runtime.getProjectSnapshot(req.params.projectId);

    if (!snapshot) {
      res.status(404).json({ error: "Projeto não encontrado." });
      return;
    }

    res.json(snapshot.dashboard);
  });

  router.get("/:projectId/files", (req, res, next) => {
    try {
      const force = String(req.query.force ?? "").toLowerCase() === "true";
      res.json(runtime.getProjectFilesOverview(req.params.projectId, force));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.get("/:projectId/files/content", (req, res, next) => {
    try {
      const filePath = String(req.query.path ?? "").trim();

      if (!filePath) {
        res.status(400).json({ error: "Informe o path do arquivo." });
        return;
      }

      res.json(runtime.getProjectFileContent(req.params.projectId, filePath));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.get("/:projectId/commands", (req, res) => {
    const snapshot = runtime.getProjectSnapshot(req.params.projectId);

    if (!snapshot) {
      res.status(404).json({ error: "Projeto não encontrado." });
      return;
    }

    res.json({
      items: snapshot.commands,
    });
  });

  router.get("/:projectId/report/log-summary", (req, res, next) => {
    try {
      res.json(runtime.getProjectLogReport(req.params.projectId));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.get("/:projectId/summary", (req, res, next) => {
    try {
      res.json(runtime.getProjectSummary(req.params.projectId));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.post("/:projectId/summary/refresh", (req, res, next) => {
    try {
      res.json(runtime.getProjectSummary(req.params.projectId));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.post("/:projectId/summary/audio", async (req, res, next) => {
    try {
      res.json(await runtime.ensureProjectSummaryAudio(req.params.projectId));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.put("/:projectId/summary/audio/status", (req, res, next) => {
    try {
      const parsed = updateSummaryAudioStatusSchema.parse(req.body);
      res.json(runtime.setProjectSummaryPlaybackStatus(req.params.projectId, parsed.status));
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  router.get("/:projectId/summary/audio", async (req, res, next) => {
    try {
      const asset = await runtime.resolveProjectSummaryAudioAsset(req.params.projectId);
      res.setHeader("Content-Type", asset.contentType);
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(asset.filePath);
    } catch (error) {
      handleProjectError(error, res, next);
    }
  });

  return router;
}
