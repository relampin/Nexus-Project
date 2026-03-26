import { CommandRecord } from "../core/types";
import { NexusProjectLog } from "../projects/types";

export interface InvalidatedCommandMatch {
  reason: string;
  evidence: string[];
}

const invalidatedCommandRules: Array<{ reason: string; patterns: RegExp[]; mode?: "any" | "all" }> = [
  {
    reason: "job antigo despachado com a raiz errada",
    patterns: [/raiz antiga/i, /job descartado/i],
  },
  {
    reason: "falso positivo em arquivo interno de estado do Nexus",
    patterns: [/data\/projects\.json/i, /data\/antigravity-session\.json/i],
  },
  {
    reason: "falso positivo em artefato interno de audio do Nexus",
    patterns: [/data\/tts-test\.wav/i],
  },
  {
    reason: "falso positivo em log interno do Nexus",
    patterns: [/logs\/\d{4}-\d{2}-\d{2}\.log/i],
  },
  {
    reason: "falso positivo apos mudanca de backend do Codex durante job visual",
    mode: "all",
    patterns: [
      /src\/projects\/service\.ts/i,
      /dist\/projects\/service\.js/i,
      /backend para auditoria automatica, resumo mais humano e narrador com audio modular/i,
    ],
  },
];

const invalidatedLogRules = [
  /raiz antiga/i,
  /data\/projects\.json/i,
  /data\/antigravity-session\.json/i,
  /data\/tts-test\.wav/i,
  /logs\/\d{4}-\d{2}-\d{2}\.log/i,
  /antigravity saiu do escopo permitido: dist\/projects\/service\.js, src\/projects\/service\.ts/i,
];

export function detectInvalidatedCommand(command: CommandRecord): InvalidatedCommandMatch | undefined {
  if (command.target !== "antigravity" || command.status !== "failed") {
    return undefined;
  }

  const haystack = [
    command.error,
    command.result ? JSON.stringify(command.result) : "",
    command.external?.requestText,
  ]
    .filter(Boolean)
    .join("\n");

  for (const rule of invalidatedCommandRules) {
    const evidence = rule.patterns
      .filter((pattern) => pattern.test(haystack))
      .map((pattern) => pattern.source);

    const matched = (rule.mode ?? "any") === "all"
      ? evidence.length === rule.patterns.length
      : evidence.length > 0;

    if (matched) {
      return {
        reason: rule.reason,
        evidence,
      };
    }
  }

  return undefined;
}

export function isInvalidatedCommand(command: CommandRecord) {
  return Boolean(detectInvalidatedCommand(command));
}

export function isInvalidatedProjectLog(entry: NexusProjectLog) {
  const haystack = `${entry.action}\n${entry.summary}\n${entry.details ?? ""}`;
  return invalidatedLogRules.some((pattern) => pattern.test(haystack));
}
