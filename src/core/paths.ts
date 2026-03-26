import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export function getNexusHome() {
  const configured = process.env.NEXUS_HOME?.trim();
  const home = configured
    ? resolve(configured)
    : process.cwd();

  ensureDirectory(home);
  return home;
}

export function getTargetProjectRoot() {
  const activeProjectRoot = readActiveProjectRoot();

  if (activeProjectRoot) {
    ensureDirectory(activeProjectRoot);
    return activeProjectRoot;
  }

  const configured = process.env.TARGET_PROJECT_ROOT?.trim();

  if (configured) {
    const target = isAbsolute(configured)
      ? configured
      : resolve(getNexusHome(), configured);

    ensureDirectory(target);
    return target;
  }

  return detectDefaultTargetProjectRoot();
}

function detectDefaultTargetProjectRoot() {
  const nexusHome = getNexusHome();
  const parent = dirname(nexusHome);
  const homeLooksLikeNexus = /nexus/i.test(basename(nexusHome));

  if (looksLikeProjectRoot(nexusHome)) {
    return nexusHome;
  }

  if (homeLooksLikeNexus && looksLikeProjectRoot(parent)) {
    return parent;
  }

  return nexusHome;
}

export function resolveNexusPath(...segments: string[]) {
  return join(getNexusHome(), ...segments);
}

export function resolveProjectPath(...segments: string[]) {
  return join(getTargetProjectRoot(), ...segments);
}

function ensureDirectory(directory: string) {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function readActiveProjectRoot() {
  const filePath = join(getNexusHome(), "data", "projects.json");

  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      activeProjectId?: string;
      workspaces?: Array<{
        project?: { id?: string };
        settings?: { projectRoot?: string };
      }>;
    };
    const activeWorkspace = parsed.workspaces?.find((workspace) => workspace.project?.id === parsed.activeProjectId);
    const configuredRoot = activeWorkspace?.settings?.projectRoot?.trim();

    if (!configuredRoot) {
      return undefined;
    }

    return isAbsolute(configuredRoot)
      ? configuredRoot
      : resolve(getNexusHome(), configuredRoot);
  } catch {
    return undefined;
  }
}

function looksLikeProjectRoot(directory: string) {
  const markers = [
    "package.json",
    ".git",
    "README.md",
    "src",
    "frontend",
    "backend",
  ];

  return markers.some((marker) => existsSync(join(directory, marker)));
}
