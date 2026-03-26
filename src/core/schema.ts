import { z } from "zod";

const agentNameSchema = z.enum(["antigravity", "codex", "system"]);
const commandKindSchema = z.enum(["ping", "note", "task", "list_pending", "status_summary"]);
const uiThemePresetSchema = z.enum(["nexus", "ocean", "ember", "forest", "graphite"]);
const uiPanelModeSchema = z.enum(["full", "simplified"]);

export const commandRequestSchema = z.object({
  source: agentNameSchema,
  target: agentNameSchema,
  kind: commandKindSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  meta: z.object({
    channel: z.enum(["api", "ui", "bridge"]).optional(),
    delegatedBy: agentNameSchema.optional(),
    projectId: z.string().min(1).optional(),
    guardrail: z.object({
      alertInjectedAt: z.string().optional(),
      violatingFiles: z.array(z.string()).optional(),
      correctionForId: z.string().optional(),
      autoCorrectionDepth: z.number().optional(),
    }).optional(),
    delivery: z.object({
      mode: z.enum(["cdp", "manual"]).optional(),
      deliveredAt: z.string().optional(),
      promptInjectedAt: z.string().optional(),
    }).optional(),
  }).optional(),
});

export const uiDispatchSchema = z.object({
  source: z.enum(["antigravity", "codex", "system", "user"]),
  target: agentNameSchema,
  kind: commandKindSchema.default("task"),
  projectId: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  payload: z.object({
    text: z.string().min(1),
  }).optional(),
});

export const updateUiPreferencesSchema = z.object({
  themePreset: uiThemePresetSchema.optional(),
  panelMode: uiPanelModeSchema.optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe ao menos uma preferencia para atualizar.",
});
