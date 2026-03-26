import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { AntigravityGuardrailPayload, CommandRecord, ExternalDispatch } from "../core/types";

interface SnapshotEntry {
  path: string;
  hash: string;
  size: number;
}

interface SnapshotFile {
  root: string;
  generatedAt: string;
  files: SnapshotEntry[];
}

export interface AntigravityGuardrailInspection {
  changedFiles: string[];
  violatingFiles: string[];
  warningFiles: string[];
  ignoredFiles: string[];
  missingLogSections: string[];
}

export interface AntigravityReviewReport {
  status: "approved" | "approved_with_notes" | "failed";
  summary: string;
  changedFiles: string[];
  projectChangedFiles: string[];
  declaredChangedFiles: string[];
  undeclaredChangedFiles: string[];
  violatingFiles: string[];
  warningFiles: string[];
  ignoredFiles: string[];
  missingLogSections: string[];
  warnings: string[];
  passedChecks: string[];
}

const defaultAllowedPaths = ["frontend", "docs", "assets", "bridge", "log"];
const defaultBlockedPaths = ["src", "dist", "data", "package.json", "package-lock.json", ".env", ".env.example", "tsconfig.json"];
const snapshotIgnorePrefixes = [
  "node_modules",
  ".git",
  "logs",
  "data/queue.json",
  "data/telegram-state.json",
  "data/projects.json",
  "data/antigravity-session.json",
  "data/audit-report.json",
  "data/project-summary-audio.json",
  "data/tts",
];
const requiredLogSections = [
  "o que recebi",
  "objetivo",
  "arquivos inspecionados",
  "arquivos alterados",
  "o que fiz",
  "o que deleguei",
  "o que falta validar",
];
const advisoryArtifactPattern = /(^|\/)(diff|changes|notes|scratch|todo|observacoes|resumo)\.(txt|md|diff)$/i;

export function createAntigravityMonitor(command: CommandRecord, jobDirectory: string, projectRoot: string): ExternalDispatch["monitor"] {
  const payloadGuardrails = readGuardrailPayload(command.payload.guardrails);
  const baselineFile = join(jobDirectory, "baseline.snapshot.json");
  const reviewFile = join(jobDirectory, "review.json");
  const scope = payloadGuardrails.scope ?? "frontend";
  const allowedPaths = normalizePaths(payloadGuardrails.allowedPaths ?? defaultAllowedPaths);
  const blockedPaths = normalizePaths(payloadGuardrails.blockedPaths ?? defaultBlockedPaths);
  const enabled = payloadGuardrails.monitor ?? true;
  const stopOnViolation = payloadGuardrails.stopOnViolation ?? true;

  if (enabled) {
    writeProjectSnapshot(baselineFile, projectRoot);
  }

  return {
    projectRoot,
    scope,
    enabled,
    allowedPaths,
    blockedPaths,
    stopOnViolation,
    baselineFile,
    reviewFile,
  };
}

export function inspectAntigravityGuardrails(command: CommandRecord, rawLog?: string): AntigravityGuardrailInspection | null {
  const monitor = command.external?.monitor;

  if (!monitor?.enabled) {
    return null;
  }

  const changedFiles = readChangedFiles(monitor.baselineFile);
  const ignoredFiles = changedFiles.filter((filePath) => isAdvisoryArtifact(filePath));
  const relevantFiles = changedFiles.filter((filePath) => !ignoredFiles.includes(filePath));
  const violatingFiles = relevantFiles.filter((filePath) => matchesAnyRule(filePath, monitor.blockedPaths));
  const warningFiles = relevantFiles.filter((filePath) =>
    !matchesAnyRule(filePath, monitor.blockedPaths)
    && !matchesAnyRule(filePath, monitor.allowedPaths));
  const missingLogSections = rawLog ? validateAntigravityLog(rawLog) : [];

  return {
    changedFiles,
    violatingFiles,
    warningFiles,
    ignoredFiles,
    missingLogSections,
  };
}

export function buildGuardrailAlertPrompt(command: CommandRecord, violatingFiles: string[]) {
  const external = command.external;
  const requestFile = external?.requestFile ?? "nao informado";
  const logFile = external?.logFile ?? external?.responseFile ?? "nao informado";
  const allowedPaths = external?.monitor?.allowedPaths.join(", ") ?? "frontend, docs, bridge, log";

  return [
    `Pausa no job ${command.id}.`,
    "O Nexus detectou alteracoes em areas protegidas do projeto.",
    `Arquivos suspeitos: ${violatingFiles.slice(0, 10).join(", ")}`,
    `Area principal desta tarefa: ${allowedPaths}.`,
    "Nao mexa em backend, dados, configs ou contratos sem autorizacao.",
    `Revise o requestFile ${requestFile}.`,
    `Corrija o escopo e finalize pelo log em ${logFile}.`,
  ].join("\n");
}

export function validateAntigravityLog(rawLog: string) {
  const lowered = rawLog.toLowerCase();
  return requiredLogSections.filter((section) => !lowered.includes(section));
}

export function createAntigravityReviewReport(command: CommandRecord, rawLog: string) {
  const inspection = inspectAntigravityGuardrails(command, rawLog) ?? {
    changedFiles: [],
    violatingFiles: [],
    warningFiles: [],
    ignoredFiles: [],
    missingLogSections: [],
  };
  const projectRoot = command.external?.monitor?.projectRoot ?? command.external?.projectRoot ?? process.cwd();
  const sections = parseLogSections(rawLog);
  const declaredChangedFiles = normalizePaths(extractFileMentions(sections.get("arquivos alterados") ?? ""));
  const ignoredFiles = normalizePaths([
    toProjectRelativePath(command.external?.requestFile, projectRoot),
    toProjectRelativePath(command.external?.logFile ?? command.external?.responseFile, projectRoot),
    toProjectRelativePath(command.external?.monitor?.baselineFile, projectRoot),
    toProjectRelativePath(command.external?.reviewFile ?? command.external?.monitor?.reviewFile, projectRoot),
  ].filter((item): item is string => Boolean(item)));
  const projectChangedFiles = inspection.changedFiles.filter((filePath) =>
    !ignoredFiles.includes(filePath)
    && !inspection.ignoredFiles.includes(filePath));
  const undeclaredChangedFiles = projectChangedFiles.filter((filePath) => !matchesDeclaration(filePath, declaredChangedFiles));
  const warnings: string[] = [];
  const passedChecks: string[] = [];

  if (inspection.missingLogSections.length === 0) {
    passedChecks.push("log com secoes obrigatorias");
  }

  if (inspection.violatingFiles.length === 0) {
    passedChecks.push("nenhuma alteracao bloqueante em area protegida");
  }

  if (projectChangedFiles.length > 0) {
    passedChecks.push(`arquivos alterados detectados: ${projectChangedFiles.length}`);
  } else {
    warnings.push("nenhuma alteracao de projeto foi detectada alem dos artefatos do proprio Nexus");
  }

  if (undeclaredChangedFiles.length > 0) {
    warnings.push(`arquivos alterados nao listados no log: ${undeclaredChangedFiles.join(", ")}`);
  } else if (projectChangedFiles.length > 0) {
    passedChecks.push("arquivos alterados descritos no log");
  }

  if (inspection.warningFiles.length > 0) {
    warnings.push(`mudancas fora da area principal, mas nao bloqueantes: ${inspection.warningFiles.join(", ")}`);
  }

  if (!hasValidationEvidence(rawLog)) {
    warnings.push("o log nao deixou clara a validacao final do que foi feito");
  } else {
    passedChecks.push("log com evidencia de validacao");
  }

  let status: AntigravityReviewReport["status"] = "approved";

  if (inspection.missingLogSections.length > 0 || inspection.violatingFiles.length > 0) {
    status = "failed";
  } else if (warnings.length > 0) {
    status = "approved_with_notes";
  }

  return {
    status,
    summary: buildReviewSummary(status, warnings, inspection, projectChangedFiles),
    changedFiles: inspection.changedFiles,
    projectChangedFiles,
    declaredChangedFiles,
    undeclaredChangedFiles,
    violatingFiles: inspection.violatingFiles,
    warningFiles: inspection.warningFiles,
    ignoredFiles: inspection.ignoredFiles,
    missingLogSections: inspection.missingLogSections,
    warnings,
    passedChecks,
  };
}

export function writeAntigravityReviewReport(filePath: string, review: AntigravityReviewReport) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(review, null, 2)}\n`, "utf-8");
}

function writeProjectSnapshot(filePath: string, projectRoot: string) {
  const snapshot: SnapshotFile = {
    root: projectRoot,
    generatedAt: new Date().toISOString(),
    files: collectSnapshotEntries(projectRoot),
  };

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
}

function readChangedFiles(baselineFile: string) {
  if (!existsSync(baselineFile)) {
    return [];
  }

  const snapshot = JSON.parse(readFileSync(baselineFile, "utf-8")) as SnapshotFile;
  const currentEntries = collectSnapshotEntries(snapshot.root);
  const baselineMap = new Map(snapshot.files.map((entry) => [entry.path, `${entry.hash}:${entry.size}`]));
  const currentMap = new Map(currentEntries.map((entry) => [entry.path, `${entry.hash}:${entry.size}`]));
  const changed = new Set<string>();

  for (const [filePath, signature] of currentMap.entries()) {
    if (baselineMap.get(filePath) !== signature) {
      changed.add(filePath);
    }
  }

  for (const filePath of baselineMap.keys()) {
    if (!currentMap.has(filePath)) {
      changed.add(filePath);
    }
  }

  return [...changed].sort();
}

function collectSnapshotEntries(root: string, currentDirectory = root): SnapshotEntry[] {
  const entries = readdirSync(currentDirectory, { withFileTypes: true });
  const files: SnapshotEntry[] = [];

  for (const entry of entries) {
    const absolutePath = join(currentDirectory, entry.name);
    const relativePath = normalizeRelativePath(relative(root, absolutePath));

    if (shouldIgnorePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectSnapshotEntries(root, absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const content = readFileSync(absolutePath);
    const stats = statSync(absolutePath);

    files.push({
      path: relativePath,
      hash: createHash("sha1").update(content).digest("hex"),
      size: stats.size,
    });
  }

  return files;
}

function shouldIgnorePath(relativePath: string) {
  return snapshotIgnorePrefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`));
}

function readGuardrailPayload(value: unknown): AntigravityGuardrailPayload {
  if (!value || typeof value !== "object") {
    return {};
  }

  const payload = value as Record<string, unknown>;
  return {
    scope: payload.scope === "mixed" ? "mixed" : payload.scope === "frontend" ? "frontend" : undefined,
    allowedPaths: Array.isArray(payload.allowedPaths) ? payload.allowedPaths.filter((item): item is string => typeof item === "string") : undefined,
    blockedPaths: Array.isArray(payload.blockedPaths) ? payload.blockedPaths.filter((item): item is string => typeof item === "string") : undefined,
    monitor: typeof payload.monitor === "boolean" ? payload.monitor : undefined,
    stopOnViolation: typeof payload.stopOnViolation === "boolean" ? payload.stopOnViolation : undefined,
  };
}

function normalizePaths(paths: string[]) {
  return [...new Set(paths.map((path) => normalizeRelativePath(path)).filter(Boolean))];
}

function isAdvisoryArtifact(filePath: string) {
  return advisoryArtifactPattern.test(filePath);
}

function matchesAnyRule(filePath: string, rules: string[]) {
  if (rules.length === 0) {
    return true;
  }

  return rules.some((rule) => filePath === rule || filePath.startsWith(`${rule}/`));
}

function normalizeRelativePath(input: string) {
  return input
    .split(sep)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .trim();
}

function parseLogSections(rawLog: string) {
  const sections = new Map<string, string>();
  const lines = rawLog.split(/\r?\n/);
  let current = "";
  let buffer: string[] = [];

  for (const line of lines) {
    const match = line.trim().match(/^#{1,6}\s+(.+)$/);

    if (match) {
      if (current) {
        sections.set(normalizeSectionTitle(current), buffer.join("\n").trim());
      }

      current = match[1];
      buffer = [];
      continue;
    }

    if (current) {
      buffer.push(line);
    }
  }

  if (current) {
    sections.set(normalizeSectionTitle(current), buffer.join("\n").trim());
  }

  return sections;
}

function normalizeSectionTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractFileMentions(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => /[./\\]/.test(line));
}

function matchesDeclaration(filePath: string, declarations: string[]) {
  return declarations.some((declared) => {
    const normalized = normalizeRelativePath(declared);
    return normalized === filePath
      || normalized.endsWith(`/${filePath}`)
      || filePath.endsWith(`/${normalized}`);
  });
}

function hasValidationEvidence(rawLog: string) {
  const lowered = rawLog
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return ["validei", "validado", "validacao", "testei", "teste", "verifiquei", "verificado", "conferi", "http://", "https://", "200", "ok"]
    .some((token) => lowered.includes(token));
}

function buildReviewSummary(
  status: AntigravityReviewReport["status"],
  warnings: string[],
  inspection: AntigravityGuardrailInspection,
  projectChangedFiles: string[],
) {
  if (status === "failed") {
    if (inspection.violatingFiles.length > 0) {
      return `review falhou; Antigravity tocou ${inspection.violatingFiles.length} arquivo(s) em area protegida`;
    }

    return `review falhou; faltaram secoes obrigatorias no log do Antigravity`;
  }

  if (status === "approved_with_notes") {
    return `review aprovado com ressalvas; ${warnings[0] ?? "ha observacoes no log de review"}`;
  }

  return `review aprovado; ${projectChangedFiles.length} arquivo(s) de projeto alterado(s) dentro do escopo`;
}

function toProjectRelativePath(targetPath: string | undefined, projectRoot: string) {
  if (!targetPath) {
    return undefined;
  }

  return normalizeRelativePath(relative(projectRoot, targetPath));
}
