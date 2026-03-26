import { z } from "zod";

const agentNameSchema = z.enum(["antigravity", "codex", "system"]);
const commandKindSchema = z.enum(["ping", "note", "task", "list_pending", "status_summary"]);

export const commandRequestSchema = z.object({
  source: agentNameSchema,
  target: agentNameSchema,
  kind: commandKindSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  meta: z.object({
    channel: z.enum(["api", "ui", "telegram"]).optional(),
    delegatedBy: agentNameSchema.optional(),
    projectId: z.string().min(1).optional(),
    guardrail: z.object({
      alertInjectedAt: z.string().optional(),
      violatingFiles: z.array(z.string()).optional(),
      correctionForId: z.string().optional(),
      autoCorrectionDepth: z.number().optional(),
    }).optional(),
    telegram: z.object({
      replyChatId: z.number().optional(),
      targetChatId: z.number().optional(),
      inboundMessageId: z.number().optional(),
      relaySentAt: z.string().optional(),
      promptInjectedAt: z.string().optional(),
      statusNotifiedAt: z.string().optional(),
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

export const telegramRelaySchema = z.object({
  sender: agentNameSchema,
  target: z.enum(["antigravity", "codex"]),
  text: z.string().min(1),
  kind: commandKindSchema.default("task"),
  replyChatId: z.number().optional(),
  delegatedBy: agentNameSchema.optional(),
});
