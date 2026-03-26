import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import {
  ProjectFileContentSnapshot,
  ProjectFileDirectorySummary,
  ProjectFileEntry,
  ProjectFileOverview,
} from "./types";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "out",
  "target",
  "tmp",
  "temp",
]);

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".env",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".mjs",
  ".php",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

const KEY_FILE_NAMES = new Set([
  "readme.md",
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "dockerfile",
  "compose.yml",
  "docker-compose.yml",
  "next.config.js",
  "next.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "server.js",
  "server.ts",
  "index.html",
]);

const PURPOSE_RULES = [
  {
    patterns: ["nexus", "codex", "antigravity", "orquestr"],
    summary: "um painel de orquestracao para coordenar agentes de IA e acompanhar projetos",
  },
  {
    patterns: ["loja", "e-commerce", "store", "carrinho", "checkout", "produto"],
    summary: "uma aplicacao de loja com foco em catalogo, compra e acompanhamento de pedidos",
  },
  {
    patterns: ["dashboard", "painel", "analytics", "monitor"],
    summary: "um painel operacional voltado a visualizacao, controle e acompanhamento de atividades",
  },
  {
    patterns: ["api", "backend", "server", "express"],
    summary: "um backend ou servico de integracao com regras e endpoints proprios",
  },
  {
    patterns: ["bot", "telegram", "discord", "chat"],
    summary: "uma automacao conversacional integrada a canais e agentes",
  },
];

const MAX_FILES = 800;
const MAX_ENTRIES_IN_OVERVIEW = 120;
const MAX_DIRECTORIES = 18;
const MAX_PREVIEW_CHARS = 240;
const MAX_CONTENT_BYTES = 48_000;
const MAX_BINARY_CHECK_BYTES = 512;

export function scanWorkspaceFiles(root: string): ProjectFileOverview {
  const entries: ProjectFileEntry[] = [];
  const directoryCounts = new Map<string, number>();
  let directories = 0;
  let textFiles = 0;
  let bytes = 0;
  let unreadableFiles = 0;
  let omittedFiles = 0;

  const walk = (currentDirectory: string) => {
    if (entries.length >= MAX_FILES) {
      omittedFiles += 1;
      return;
    }

    let dirEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      dirEntries = readdirSync(currentDirectory, { withFileTypes: true });
    } catch {
      unreadableFiles += 1;
      return;
    }

    for (const dirEntry of dirEntries) {
      const absolutePath = join(currentDirectory, dirEntry.name);
      const relativePath = toProjectPath(root, absolutePath);

      if (!relativePath) {
        continue;
      }

      if (dirEntry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(dirEntry.name.toLowerCase())) {
          continue;
        }

        directories += 1;
        walk(absolutePath);
        continue;
      }

      if (!dirEntry.isFile()) {
        continue;
      }

      if (entries.length >= MAX_FILES) {
        omittedFiles += 1;
        break;
      }

      try {
        const stat = statSync(absolutePath);
        const extension = extname(dirEntry.name).toLowerCase();
        const isText = isTextFile(absolutePath, extension);

        if (isText) {
          textFiles += 1;
        }

        bytes += stat.size;
        incrementDirectoryCount(directoryCounts, relativePath);

        entries.push({
          path: relativePath,
          name: dirEntry.name,
          extension,
          category: categorizeFile(relativePath, extension),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          isText,
          isKeyFile: isKeyFile(relativePath),
          preview: isText ? readPreview(absolutePath) : undefined,
        });
      } catch {
        unreadableFiles += 1;
      }
    }
  };

  walk(root);

  const sortedEntries = entries
    .sort((left, right) => {
      if (left.isKeyFile !== right.isKeyFile) {
        return left.isKeyFile ? -1 : 1;
      }

      if (left.category !== right.category) {
        return left.category.localeCompare(right.category);
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, MAX_ENTRIES_IN_OVERVIEW);

  const keyFiles = entries
    .filter((entry) => entry.isKeyFile)
    .map((entry) => entry.path)
    .slice(0, 12);

  const directoriesList = Array.from(directoryCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_DIRECTORIES)
    .map<ProjectFileDirectorySummary>(([path, fileCount]) => ({ path, fileCount }));

  return {
    root,
    generatedAt: new Date().toISOString(),
    synopsis: buildSynopsis(root, entries),
    totals: {
      files: entries.length,
      textFiles,
      directories,
      bytes,
      keyFiles: keyFiles.length,
      unreadableFiles,
      omittedFiles,
    },
    keyFiles,
    directories: directoriesList,
    entries: sortedEntries,
  };
}

export function readWorkspaceFile(root: string, requestedPath: string): ProjectFileContentSnapshot {
  const normalized = requestedPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolutePath = resolve(root, normalized);
  const relativePath = toProjectPath(root, absolutePath);

  if (!relativePath || relativePath !== normalized) {
    throw new Error("Arquivo fora do escopo do projeto.");
  }

  const stat = statSync(absolutePath);
  const buffer = readFileSync(absolutePath);
  const truncated = buffer.byteLength > MAX_CONTENT_BYTES;
  const content = buffer.subarray(0, MAX_CONTENT_BYTES).toString("utf8");

  return {
    path: relativePath,
    content,
    truncated,
    lineCount: content.split(/\r?\n/).length,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function buildSynopsis(root: string, entries: ProjectFileEntry[]) {
  const readme = entries.find((entry) => entry.path.toLowerCase() === "readme.md");
  const packageJson = entries.find((entry) => entry.path.toLowerCase() === "package.json");
  const backendFiles = entries.filter((entry) => entry.category === "code" && /(server|api|backend|routes?)/i.test(entry.path));
  const frontendFiles = entries.filter((entry) => entry.category === "code" && /(frontend|app|components?|pages?|index\.html)/i.test(entry.path));
  const docsCount = entries.filter((entry) => entry.category === "docs").length;
  const configFiles = entries.filter((entry) => entry.category === "config").length;
  const logFiles = entries.filter((entry) => entry.category === "logs").length;
  const packageInsight = readPackageInsight(packageJson?.preview);
  const purposeSummary = inferPurposeSummary(root, readme?.preview, packageInsight, frontendFiles.length, backendFiles.length);
  const stackSummary = inferStackSummary(entries, packageInsight);
  const architectureSummary = inferArchitectureSummary(frontendFiles.length, backendFiles.length, docsCount, configFiles, logFiles);
  const keyFilesSummary = buildKeyFilesSummary(entries);
  const nextStepSummary = inferNextStep(frontendFiles.length, backendFiles.length, docsCount, logFiles, entries.length);

  return [
    `Pelo que o Nexus entendeu, este projeto parece ser ${purposeSummary}.`,
    stackSummary
      ? `A base tecnica mais provavel eh ${stackSummary}.`
      : "A stack principal ainda nao ficou 100% clara, mas ja existem pistas suficientes para seguir a leitura.",
    architectureSummary,
    keyFilesSummary,
    nextStepSummary,
  ].filter(Boolean).join("\n\n");
}

function summarizePackageJson(preview: string) {
  try {
    const parsed = JSON.parse(preview) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    const scripts = Object.keys(parsed.scripts ?? {});
    const dependencies = Object.keys(parsed.dependencies ?? {});
    const packageName = parsed.name ? `pacote ${parsed.name}` : "pacote sem nome explicito";
    const scriptSummary = scripts.length > 0 ? `scripts como ${scripts.slice(0, 3).join(", ")}` : "sem scripts claros no recorte";
    const dependencySummary = dependencies.length > 0 ? `dependencias como ${dependencies.slice(0, 3).join(", ")}` : "";
    return [packageName, scriptSummary, dependencySummary].filter(Boolean).join("; ");
  } catch {
    return firstSentence(preview);
  }
}

function readPackageInsight(preview?: string) {
  if (!preview) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(preview) as {
      name?: string;
      description?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return {
      name: parsed.name?.trim(),
      description: parsed.description?.trim(),
      scripts: Object.keys(parsed.scripts ?? {}),
      dependencies: Object.keys({
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
      }),
    };
  } catch {
    return undefined;
  }
}

function inferPurposeSummary(
  root: string,
  readmePreview: string | undefined,
  packageInsight: ReturnType<typeof readPackageInsight> | undefined,
  frontendCount: number,
  backendCount: number,
) {
  const combined = [
    packageInsight?.name,
    packageInsight?.description,
    readmePreview,
    root,
  ].filter(Boolean).join(" ").toLowerCase();

  const matched = PURPOSE_RULES.find((rule) => rule.patterns.some((pattern) => combined.includes(pattern)));

  if (matched) {
    return matched.summary;
  }

  if (frontendCount > 0 && backendCount > 0) {
    return "uma aplicacao completa com interface e camada de servidor";
  }

  if (frontendCount > 0) {
    return "uma interface ou painel focado na experiencia do usuario";
  }

  if (backendCount > 0) {
    return "um servico ou backend focado em regras, dados e integracoes";
  }

  return "um workspace tecnico que ainda precisa de mais contexto para uma classificacao mais precisa";
}

function inferStackSummary(entries: ProjectFileEntry[], packageInsight?: ReturnType<typeof readPackageInsight>) {
  const hints = new Set<string>();
  const dependencyNames = (packageInsight?.dependencies ?? []).map((item) => item.toLowerCase());
  const paths = entries.map((entry) => entry.path.toLowerCase());

  if (packageInsight) {
    hints.add("Node.js");
  }

  if (paths.some((path) => path.endsWith(".ts") || path.endsWith(".tsx") || path.includes("tsconfig"))) {
    hints.add("TypeScript");
  }

  if (dependencyNames.includes("react") || dependencyNames.some((dep) => dep.startsWith("@types/react"))) {
    hints.add("React");
  }

  if (dependencyNames.includes("next")) {
    hints.add("Next.js");
  }

  if (dependencyNames.includes("vite") || paths.some((path) => path.includes("vite.config"))) {
    hints.add("Vite");
  }

  if (dependencyNames.includes("express") || paths.some((path) => /backend\/|server\.ts$|server\.js$|routes?\//.test(path))) {
    hints.add("Express/backend HTTP");
  }

  if (paths.some((path) => path.endsWith(".py") || path.endsWith("requirements.txt") || path.endsWith("pyproject.toml"))) {
    hints.add("Python");
  }

  if (paths.some((path) => path.endsWith("dockerfile") || path.endsWith("compose.yml") || path.endsWith("docker-compose.yml"))) {
    hints.add("Docker");
  }

  return Array.from(hints).join(", ");
}

function inferArchitectureSummary(
  frontendCount: number,
  backendCount: number,
  docsCount: number,
  configFiles: number,
  logFiles: number,
) {
  const parts = [
    frontendCount > 0 ? `${frontendCount} arquivo(s) com cara de frontend ou interface` : "",
    backendCount > 0 ? `${backendCount} arquivo(s) ligados a backend, servidor ou API` : "",
    docsCount > 0 ? `${docsCount} arquivo(s) de documentacao` : "",
    configFiles > 0 ? `${configFiles} arquivo(s) de configuracao` : "",
    logFiles > 0 ? `${logFiles} arquivo(s) de log ou historico` : "",
  ].filter(Boolean);

  if (parts.length === 0) {
    return "Ainda nao apareceram marcadores fortes de arquitetura, entao o projeto parece bem inicial ou bastante customizado.";
  }

  return `Na leitura estrutural, o Nexus encontrou ${joinNatural(parts)}.`;
}

function buildKeyFilesSummary(entries: ProjectFileEntry[]) {
  const keyPaths = entries
    .filter((entry) => entry.isKeyFile)
    .slice(0, 6)
    .map((entry) => entry.path);

  if (keyPaths.length === 0) {
    return "Nao apareceram arquivos-chave classicos como README, package.json ou server principal, entao o entendimento ainda depende mais da estrutura geral.";
  }

  return `Os arquivos que mais ajudam a explicar o projeto ate agora sao ${joinNatural(keyPaths)}.`;
}

function inferNextStep(
  frontendCount: number,
  backendCount: number,
  docsCount: number,
  logFiles: number,
  totalFiles: number,
) {
  if (totalFiles < 8) {
    return "Como o workspace ainda eh pequeno, o proximo ganho vem de conectar mais contexto real ou amadurecer a estrutura base.";
  }

  if (frontendCount > 0 && backendCount > 0) {
    return "O proximo passo mais util eh cruzar interface, API e historico recente para transformar essa leitura em backlog e progresso real no painel.";
  }

  if (frontendCount > 0 && backendCount === 0) {
    return "O proximo passo mais util eh confirmar como essa interface consome dados, ou se ainda falta uma camada de backend ou mocks claros.";
  }

  if (backendCount > 0 && frontendCount === 0) {
    return "O proximo passo mais util eh identificar os pontos de entrada do servico, contratos e como isso deve aparecer numa interface ou consumidor.";
  }

  if (docsCount > 0 || logFiles > 0) {
    return "Ja existe contexto documental suficiente para o Nexus montar um entendimento melhor do fluxo e das pendencias reais do projeto.";
  }

  return "Com mais algumas referencias de entrada, documentacao ou historico, o Nexus consegue transformar essa leitura em um resumo ainda mais preciso.";
}

function joinNatural(items: string[]) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} e ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function firstSentence(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const sentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return sentence.slice(0, MAX_PREVIEW_CHARS);
}

function readPreview(absolutePath: string) {
  try {
    const preview = readFileSync(absolutePath, "utf8").slice(0, MAX_PREVIEW_CHARS);
    return preview.replace(/\s+/g, " ").trim();
  } catch {
    return undefined;
  }
}

function incrementDirectoryCount(directoryCounts: Map<string, number>, relativePath: string) {
  const segments = relativePath.split("/");
  const directory = segments.length > 1 ? segments.slice(0, -1).join("/") : ".";
  directoryCounts.set(directory, (directoryCounts.get(directory) ?? 0) + 1);
}

function categorizeFile(relativePath: string, extension: string): ProjectFileEntry["category"] {
  const lowered = relativePath.toLowerCase();

  if (lowered.startsWith("docs/") || extension === ".md" || extension === ".txt") {
    return "docs";
  }

  if (lowered.startsWith("log/") || lowered.startsWith("logs/") || extension === ".log") {
    return "logs";
  }

  if (lowered.startsWith("assets/") || lowered.startsWith("public/") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"].includes(extension)) {
    return "assets";
  }

  if ([".json", ".toml", ".yaml", ".yml", ".env", ".ini", ".cfg", ".conf"].includes(extension) || lowered.includes("config")) {
    return "config";
  }

  if ([".sql", ".csv", ".db"].includes(extension) || lowered.startsWith("data/")) {
    return "data";
  }

  if (TEXT_EXTENSIONS.has(extension) || lowered.includes("src/") || lowered.includes("frontend/") || lowered.includes("backend/")) {
    return "code";
  }

  return "other";
}

function isKeyFile(relativePath: string) {
  const lowered = relativePath.toLowerCase();

  if (KEY_FILE_NAMES.has(lowered)) {
    return true;
  }

  return /(readme|package\.json|server\.(js|ts)|index\.html|tsconfig\.json|vite\.config|next\.config|dockerfile)/i.test(relativePath);
}

function isTextFile(absolutePath: string, extension: string) {
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  try {
    const sample = readFileSync(absolutePath);
    const slice = sample.subarray(0, MAX_BINARY_CHECK_BYTES);
    return !slice.includes(0);
  } catch {
    return false;
  }
}

function toProjectPath(root: string, absolutePath: string) {
  const relativePath = relative(root, absolutePath).replace(/\\/g, "/");

  if (!relativePath || relativePath.startsWith("..")) {
    return undefined;
  }

  return relativePath;
}
