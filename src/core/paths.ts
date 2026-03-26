import { existsSync, mkdirSync } from "node:fs";
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
  const configuredPlatformRoot = process.env.NEXUS_PLATFORM_ROOT?.trim();
  const configured = process.env.TARGET_PROJECT_ROOT?.trim();
  const preferredRoot = configuredPlatformRoot || configured;

  if (preferredRoot) {
    const target = isAbsolute(preferredRoot)
      ? preferredRoot
      : resolve(getNexusHome(), preferredRoot);

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
