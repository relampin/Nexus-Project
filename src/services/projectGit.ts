import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ProjectGitCommitSnapshot, ProjectGitFileChange, ProjectGitSnapshot } from "../projects/types";

const CACHE_TTL_MS = 10_000;

interface CachedGitSnapshot {
  root: string;
  expiresAt: number;
  value: ProjectGitSnapshot;
}

export class ProjectGitService {
  private readonly cache = new Map<string, CachedGitSnapshot>();

  getSnapshot(root: string): ProjectGitSnapshot {
    const cached = this.cache.get(root);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = this.readSnapshot(root);
    this.cache.set(root, {
      root,
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });
    return value;
  }

  invalidate(root: string) {
    this.cache.delete(root);
  }

  private readSnapshot(root: string): ProjectGitSnapshot {
    if (!existsSync(join(root, ".git"))) {
      return {
        available: false,
        root,
        clean: true,
        ahead: 0,
        behind: 0,
        summary: "Este projeto não parece estar ligado a um repositório Git local.",
        changedFiles: [],
        recentCommits: [],
      };
    }

    try {
      const statusOutput = execFileSync("git", ["-C", root, "status", "--short", "--branch"], {
        encoding: "utf8",
        windowsHide: true,
      });
      const logOutput = execFileSync("git", ["-C", root, "log", "-n", "5", "--pretty=format:%H%x09%an%x09%aI%x09%s"], {
        encoding: "utf8",
        windowsHide: true,
      });
      const lines = statusOutput.split(/\r?\n/).filter(Boolean);
      const branchLine = lines[0] ?? "";
      const changedFiles = this.parseChangedFiles(lines.slice(1));
      const { branch, ahead, behind } = this.parseBranchLine(branchLine);
      const recentCommits = this.parseCommits(logOutput);
      const clean = changedFiles.length === 0;

      return {
        available: true,
        root,
        branch,
        clean,
        ahead,
        behind,
        summary: clean
          ? `Branch ${branch ?? "desconhecida"} está limpa.`
          : `${changedFiles.length} arquivo(s) com mudança local na branch ${branch ?? "desconhecida"}.`,
        changedFiles,
        recentCommits,
      };
    } catch (error) {
      return {
        available: false,
        root,
        clean: true,
        ahead: 0,
        behind: 0,
        summary: "O Nexus não conseguiu ler o estado do Git neste workspace.",
        changedFiles: [],
        recentCommits: [],
        error: error instanceof Error ? error.message : "Falha ao ler Git.",
      };
    }
  }

  private parseBranchLine(line: string) {
    const normalized = line.replace(/^##\s*/, "").trim();
    const [head, tracking] = normalized.split("...");
    const bracketMatch = normalized.match(/\[(.+?)\]/);
    let ahead = 0;
    let behind = 0;

    if (bracketMatch?.[1]) {
      const parts = bracketMatch[1].split(",").map((item) => item.trim());
      for (const part of parts) {
        const aheadMatch = part.match(/ahead\s+(\d+)/i);
        const behindMatch = part.match(/behind\s+(\d+)/i);

        if (aheadMatch) {
          ahead = Number(aheadMatch[1]);
        }

        if (behindMatch) {
          behind = Number(behindMatch[1]);
        }
      }
    }

    return {
      branch: (tracking ? head : normalized).replace(/\s+\[.+\]$/, "").trim(),
      ahead,
      behind,
    };
  }

  private parseChangedFiles(lines: string[]): ProjectGitFileChange[] {
    return lines.slice(0, 20).map((line) => {
      const code = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;

      return {
        path,
        status: this.mapStatus(code),
        staged: code[0] !== " " && code[0] !== "?",
      };
    });
  }

  private parseCommits(raw: string): ProjectGitCommitSnapshot[] {
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, author, timestamp, summary] = line.split("\t");
        return {
          hash: hash ?? "",
          author: author ?? "autor desconhecido",
          timestamp: timestamp ?? new Date().toISOString(),
          summary: summary ?? "(sem resumo)",
        };
      });
  }

  private mapStatus(code: string): ProjectGitFileChange["status"] {
    if (code === "??") {
      return "untracked";
    }

    if (code.includes("R")) {
      return "renamed";
    }

    if (code.includes("A")) {
      return "added";
    }

    if (code.includes("D")) {
      return "deleted";
    }

    return "modified";
  }
}
