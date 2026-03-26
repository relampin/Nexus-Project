import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JsonFileStore } from "../core/storage";
import { resolveNexusPath } from "../core/paths";
import { ProjectValidationSnapshot, ProjectValidationStep } from "../projects/types";

interface ValidationRegistry {
  projects: Record<string, ProjectValidationSnapshot>;
}

const initialRegistry: ValidationRegistry = {
  projects: {},
};

export class ProjectValidationService {
  private readonly store = new JsonFileStore<ValidationRegistry>(
    resolveNexusPath("data", "project-validations.json"),
    initialRegistry,
  );

  getLatest(projectId: string): ProjectValidationSnapshot {
    return this.store.read().projects[projectId] ?? {
      status: "idle",
      summary: "Nenhuma validação automática foi executada ainda.",
      steps: [],
    };
  }

  async run(projectId: string, root: string, triggeredBy = "manual"): Promise<ProjectValidationSnapshot> {
    const steps: ProjectValidationStep[] = [];
    const packageJsonPath = join(root, "package.json");

    if (!existsSync(root)) {
      return this.save(projectId, {
        status: "failed",
        lastRunAt: new Date().toISOString(),
        triggeredBy,
        summary: "A validação falhou porque a pasta do projeto não existe mais.",
        steps: [{
          id: "workspace",
          label: "Workspace",
          status: "failed",
          summary: "A pasta do projeto não foi encontrada.",
        }],
      });
    }

    steps.push({
      id: "workspace",
      label: "Workspace",
      status: "passed",
      summary: "A pasta do projeto está acessível para validação.",
    });

    if (!existsSync(packageJsonPath)) {
      return this.save(projectId, {
        status: "warning",
        lastRunAt: new Date().toISOString(),
        triggeredBy,
        summary: "A validação rodou só com checagens básicas porque não existe package.json neste workspace.",
        steps: [
          ...steps,
          {
            id: "package-json",
            label: "Manifesto do projeto",
            status: "skipped",
            summary: "Sem package.json para scripts automáticos.",
          },
        ],
      });
    }

    const scripts = this.readScripts(packageJsonPath);
    steps.push({
      id: "package-json",
      label: "Manifesto do projeto",
      status: "passed",
      summary: `package.json encontrado com ${Object.keys(scripts).length} script(s) declarado(s).`,
    });

    for (const scriptName of ["check", "build", "test"] as const) {
      if (!scripts[scriptName]) {
        steps.push({
          id: scriptName,
          label: `npm run ${scriptName}`,
          status: "skipped",
          summary: `O workspace não declarou o script ${scriptName}.`,
          command: `npm run ${scriptName}`,
        });
        continue;
      }

      const commandResult = this.runNpmScript(root, scriptName);
      steps.push({
        id: scriptName,
        label: `npm run ${scriptName}`,
        status: commandResult.status,
        summary: commandResult.summary,
        command: `npm run ${scriptName}`,
        output: commandResult.output,
      });
    }

    const failed = steps.filter((step) => step.status === "failed").length;
    const passed = steps.filter((step) => step.status === "passed").length;
    const skipped = steps.filter((step) => step.status === "skipped").length;
    const status = failed > 0
      ? "failed"
      : skipped > 0
        ? "warning"
        : "passed";

    return this.save(projectId, {
      status,
      lastRunAt: new Date().toISOString(),
      triggeredBy,
      summary: failed > 0
        ? `A validação encontrou ${failed} passo(s) com falha.`
        : skipped > 0
          ? `A validação passou, mas ${skipped} passo(s) foram pulados por falta de script.`
          : `Validação completa ok com ${passed} passo(s) executados.`,
      steps,
    });
  }

  private save(projectId: string, snapshot: ProjectValidationSnapshot) {
    const state = this.store.read();
    state.projects[projectId] = snapshot;
    this.store.write(state);
    return snapshot;
  }

  private readScripts(packageJsonPath: string) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
      return parsed.scripts ?? {};
    } catch {
      return {};
    }
  }

  private runNpmScript(root: string, scriptName: string) {
    const executable = process.platform === "win32"
      ? (process.env.ComSpec || "cmd.exe")
      : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm", "run", scriptName]
      : ["run", scriptName];
    const result = spawnSync(executable, args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 180_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    if (result.error) {
      return {
        status: "failed" as const,
        summary: `Falha ao iniciar npm run ${scriptName}.`,
        output: result.error.message,
      };
    }

    if (result.status !== 0) {
      return {
        status: "failed" as const,
        summary: `npm run ${scriptName} terminou com código ${result.status}.`,
        output,
      };
    }

    return {
      status: "passed" as const,
      summary: `npm run ${scriptName} concluiu sem erro.`,
      output,
    };
  }
}
