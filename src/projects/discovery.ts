import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  NexusMilestone,
  NexusProjectLog,
  NexusProjectSettings,
  NexusTask,
} from "./types";

const DISCOVERY_MARKER = "nexus:auto-discovery";

interface StructureFlags {
  hasReadme: boolean;
  hasDocs: boolean;
  hasFrontend: boolean;
  hasBackend: boolean;
  hasSource: boolean;
  hasPackageJson: boolean;
  hasGit: boolean;
  hasLogs: boolean;
  hasAssets: boolean;
  historyFiles: string[];
}

export interface DiscoveredWorkspaceSeed {
  projectName: string;
  description: string;
  settings: Partial<NexusProjectSettings>;
  tasks: NexusTask[];
  milestones: NexusMilestone[];
  logs: NexusProjectLog[];
}

export function isDiscoveryManagedText(value?: string) {
  return typeof value === "string" && value.includes(DISCOVERY_MARKER);
}

export function inspectWorkspaceSeed(projectId: string, root: string, preferredName?: string): DiscoveredWorkspaceSeed {
  if (!existsSync(root)) {
    throw new Error(`Project root não encontrado: ${root}`);
  }

  const now = new Date().toISOString();
  const structure = inspectStructure(root);
  const stackHints = inferStackHints(root, structure);
  const stackHint = stackHints.join(", ");
  const projectName = preferredName?.trim() || basename(root) || "Projeto importado";
  const structureSummary = [
    structure.hasFrontend ? "frontend" : "",
    structure.hasBackend ? "backend" : "",
    structure.hasSource ? "src" : "",
    structure.hasDocs ? "docs" : "",
    structure.hasLogs ? "logs" : "",
    structure.hasAssets ? "assets" : "",
  ].filter(Boolean);
  const description = [
    `Workspace importado de ${root}.`,
    stackHint ? `Stack sugerida: ${stackHint}.` : "Stack ainda não detectada com confiança.",
    structureSummary.length > 0
      ? `Estrutura encontrada: ${structureSummary.join(", ")}.`
      : "A pasta foi conectada, mas a estrutura ainda parece inicial ou muito personalizada.",
  ].join(" ");
  const visual = pickVisualProfile(stackHints, structure);

  return {
    projectName,
    description,
    settings: {
      projectRoot: root,
      colorToken: visual.colorToken,
      icon: visual.icon,
      stackHint: stackHint || undefined,
      lastIndexedAt: now,
    },
    tasks: buildTasks(now, structure),
    milestones: buildMilestones(now, structure),
    logs: buildLogs(projectId, now, root, structure, stackHint),
  };
}

function inspectStructure(root: string): StructureFlags {
  const hasReadme = ["README.md", "readme.md", "README.txt"].some((file) => existsSync(join(root, file)));
  const hasDocs = existsSync(join(root, "docs"));
  const hasFrontend = ["frontend", "app", "web", "public"].some((dir) => existsSync(join(root, dir)));
  const hasBackend = ["backend", "api", "server"].some((dir) => existsSync(join(root, dir)));
  const hasSource = existsSync(join(root, "src"));
  const hasPackageJson = existsSync(join(root, "package.json"));
  const hasGit = existsSync(join(root, ".git"));
  const hasLogs = ["log", "logs"].some((dir) => existsSync(join(root, dir)));
  const hasAssets = ["assets", "public", "static"].some((dir) => existsSync(join(root, dir)));
  const historyFiles = listRecentHistoryFiles(root);

  return {
    hasReadme,
    hasDocs,
    hasFrontend,
    hasBackend,
    hasSource,
    hasPackageJson,
    hasGit,
    hasLogs,
    hasAssets,
    historyFiles,
  };
}

function inferStackHints(root: string, structure: StructureFlags) {
  const hints: string[] = [];

  if (structure.hasPackageJson) {
    hints.push("Node.js");

    try {
      const raw = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...(raw.dependencies ?? {}),
        ...(raw.devDependencies ?? {}),
      };
      const depNames = Object.keys(deps).map((entry) => entry.toLowerCase());

      if (existsSync(join(root, "tsconfig.json")) || depNames.some((dep) => dep.includes("typescript") || dep.startsWith("@types/"))) {
        hints.push("TypeScript");
      }

      if (depNames.includes("react") || depNames.some((dep) => dep.startsWith("@types/react"))) {
        hints.push("React");
      }

      if (depNames.includes("next")) {
        hints.push("Next.js");
      }

      if (depNames.includes("express")) {
        hints.push("Express");
      }

      if (depNames.includes("vue")) {
        hints.push("Vue");
      }
    } catch {
      // Package corrompido não bloqueia o onboarding.
    }
  }

  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt"))) {
    hints.push("Python");
  }

  if (existsSync(join(root, "go.mod"))) {
    hints.push("Go");
  }

  if (existsSync(join(root, "Cargo.toml"))) {
    hints.push("Rust");
  }

  if (existsSync(join(root, "pom.xml")) || existsSync(join(root, "build.gradle"))) {
    hints.push("Java");
  }

  if (structure.hasFrontend && !hints.includes("Frontend")) {
    hints.push("Frontend");
  }

  if ((structure.hasBackend || structure.hasSource) && !hints.includes("Backend")) {
    hints.push("Backend");
  }

  return Array.from(new Set(hints));
}

function pickVisualProfile(stackHints: string[], structure: StructureFlags) {
  if (stackHints.includes("React")) {
    return { colorToken: "#61dafb", icon: "r" };
  }

  if (stackHints.includes("Python")) {
    return { colorToken: "#3776ab", icon: "p" };
  }

  if (stackHints.includes("Go")) {
    return { colorToken: "#00add8", icon: "g" };
  }

  if (stackHints.includes("Rust")) {
    return { colorToken: "#dea584", icon: "u" };
  }

  if (structure.hasFrontend && structure.hasBackend) {
    return { colorToken: "#8b5cf6", icon: "n" };
  }

  return { colorToken: "#06b6d4", icon: "p" };
}

function buildTasks(now: string, structure: StructureFlags): NexusTask[] {
  return [
    createTask(now, "Mapeamento automático do workspace no Nexus", "completed", "medium", "O Nexus leu a pasta do projeto e registrou a estrutura inicial."),
    createTask(now, "Backend identificado no workspace", structure.hasBackend || structure.hasSource ? "completed" : "pending", "high", structure.hasBackend || structure.hasSource
      ? "Foi encontrada uma base técnica para backend ou source principal."
      : "O Nexus não encontrou uma estrutura clara de backend ou source principal."),
    createTask(now, "Frontend identificado no workspace", structure.hasFrontend ? "completed" : "pending", "high", structure.hasFrontend
      ? "Existe uma área visível de frontend ou app dentro da pasta."
      : "O Nexus não encontrou uma pasta clara de frontend, app ou public."),
    createTask(now, "Documentação e histórico local conectados", structure.hasReadme && (structure.hasDocs || structure.hasLogs)
      ? "completed"
      : structure.hasReadme || structure.hasDocs || structure.hasLogs
        ? "in_progress"
        : "pending", "medium", structure.historyFiles.length > 0
      ? `Foram encontrados ${structure.historyFiles.length} arquivo(s) recentes de histórico local.`
      : "Ainda não apareceu histórico local relevante em log/ ou logs/."),
    createTask(now, "Revisar pendências reais do workspace após o onboarding", "pending", "critical", "Tarefa gerada pelo Nexus para transformar a leitura da pasta em backlog real do projeto."),
  ];
}

function buildMilestones(now: string, structure: StructureFlags): NexusMilestone[] {
  const structureScore = [
    structure.hasBackend || structure.hasSource,
    structure.hasFrontend,
    structure.hasReadme || structure.hasDocs,
    structure.hasLogs,
  ].filter(Boolean).length;
  const structureStatus = structureScore >= 3 ? "completed" : structureScore >= 2 ? "in_progress" : "pending";
  const historyStatus = structure.hasLogs || structure.historyFiles.length > 0 ? "completed" : "pending";

  return [
    createMilestone(now, "Workspace conectado ao Nexus", "completed", "Marco gerado automaticamente quando o projeto nasce apontando para uma pasta real."),
    createMilestone(now, "Estrutura essencial do projeto detectada", structureStatus, "Backend, frontend, documentação e base técnica foram avaliados pelo onboarding do Nexus."),
    createMilestone(now, "Histórico e observabilidade local detectados", historyStatus, "O Nexus procurou por log/, logs/ e artefatos recentes que possam alimentar o painel."),
  ];
}

function buildLogs(projectId: string, now: string, root: string, structure: StructureFlags, stackHint: string): NexusProjectLog[] {
  const logs: NexusProjectLog[] = [
    createLog(projectId, now, "project.discovery.imported", "success", `Workspace importado de ${root}.`),
    createLog(
      projectId,
      now,
      "project.discovery.structure",
      "info",
      `Estrutura detectada: ${[
        structure.hasFrontend ? "frontend" : "",
        structure.hasBackend ? "backend" : "",
        structure.hasSource ? "src" : "",
        structure.hasDocs ? "docs" : "",
        structure.hasLogs ? "logs" : "",
        structure.hasAssets ? "assets" : "",
      ].filter(Boolean).join(", ") || "sem marcadores fortes"}.`,
    ),
    createLog(
      projectId,
      now,
      "project.discovery.stack",
      "info",
      stackHint
        ? `Stack sugerida pelo Nexus: ${stackHint}.`
        : "O Nexus ainda não conseguiu inferir a stack principal com confiança.",
    ),
  ];

  if (structure.historyFiles.length > 0) {
    logs.push(createLog(
      projectId,
      now,
      "project.discovery.history",
      "success",
      `Histórico local encontrado em ${structure.historyFiles.length} arquivo(s) recente(s).`,
      structure.historyFiles.join(", "),
    ));

    for (const file of structure.historyFiles.slice(0, 4)) {
      logs.push(createLog(
        projectId,
        now,
        "project.discovery.history_entry",
        "info",
        `Histórico detectado: ${file}.`,
      ));
    }
  } else {
    logs.push(createLog(
      projectId,
      now,
      "project.discovery.history",
      "warning",
      "Nenhum histórico local foi encontrado em log/ ou logs/ durante o onboarding.",
    ));
  }

  return logs;
}

function createTask(now: string, title: string, status: NexusTask["status"], priority: NexusTask["priority"], detail: string): NexusTask {
  return {
    id: uuidv4(),
    title,
    description: `${DISCOVERY_MARKER} ${detail}`,
    status,
    priority,
    createdAt: now,
    updatedAt: now,
  };
}

function createMilestone(now: string, title: string, status: NexusMilestone["status"], detail: string): NexusMilestone {
  return {
    id: uuidv4(),
    title,
    description: `${DISCOVERY_MARKER} ${detail}`,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

function createLog(projectId: string, now: string, action: string, status: NexusProjectLog["status"], summary: string, details?: string): NexusProjectLog {
  return {
    id: uuidv4(),
    projectId,
    agent: "system",
    action,
    status,
    summary,
    details,
    timestamp: now,
  };
}

function listRecentHistoryFiles(root: string) {
  const candidates = ["log", "logs"]
    .map((dir) => join(root, dir))
    .filter((dir) => existsSync(dir));
  const files: Array<{ relativePath: string; mtimeMs: number }> = [];

  for (const directory of candidates) {
    collectFiles(root, directory, 2, files);
  }

  return files
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 6)
    .map((entry) => entry.relativePath);
}

function collectFiles(root: string, directory: string, depth: number, output: Array<{ relativePath: string; mtimeMs: number }>) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (depth > 0) {
        collectFiles(root, absolutePath, depth - 1, output);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stat = statSync(absolutePath);
    output.push({
      relativePath: absolutePath.slice(root.length + 1),
      mtimeMs: stat.mtimeMs,
    });
  }
}
