import { z } from "zod";

const projectStateSchema = z.enum(["active", "paused", "completed"]);
const taskStateSchema = z.enum(["pending", "in_progress", "completed"]);
const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
const milestoneStateSchema = z.enum(["pending", "in_progress", "completed"]);
const summaryAudioPlaybackStatusSchema = z.enum(["idle", "generating", "ready", "playing", "paused", "failed", "stopped"])
  .transform((status) => (status === "stopped" ? "ready" : status));
const personalityModeSchema = z.enum(["neutral", "sarcastic"]);
const personalityIntensitySchema = z.enum(["low", "medium", "high"]);
const projectProfileSchema = z.enum(["general", "web_app", "backend_service", "automation", "site", "ai_hub"]);
const nullableString = z.string().trim().min(1).optional();
const projectSettingsSchema = z.object({
  projectRoot: nullableString,
  colorToken: nullableString,
  icon: nullableString,
  personalityMode: personalityModeSchema.optional(),
  personalityIntensity: personalityIntensitySchema.optional(),
  profileId: projectProfileSchema.optional(),
  stackHint: nullableString,
  lastIndexedAt: nullableString,
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).default(""),
  state: projectStateSchema.default("active"),
  settings: projectSettingsSchema.optional(),
}).refine((data) => Boolean(data.name?.trim() || data.settings?.projectRoot?.trim()), {
  message: "Informe um nome ou um projectRoot para criar o projeto.",
  path: ["name"],
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  state: projectStateSchema.optional(),
  settings: projectSettingsSchema.partial().optional(),
});

export const setActiveProjectSchema = z.object({
  projectId: z.string().trim().min(1),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional(),
  status: taskStateSchema.default("pending"),
  priority: taskPrioritySchema.default("medium"),
  dueDate: nullableString,
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(500).optional(),
  status: taskStateSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: nullableString,
});

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional(),
  status: milestoneStateSchema.default("pending"),
  targetDate: nullableString,
});

export const updateMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(500).optional(),
  status: milestoneStateSchema.optional(),
  targetDate: nullableString,
});

export const updateSummaryAudioStatusSchema = z.object({
  status: summaryAudioPlaybackStatusSchema,
});
