import { NexusProjectsService } from "../projects/service";
import { readWorkspaceFile, scanWorkspaceFiles } from "../projects/files";

const CACHE_TTL_MS = 15_000;

interface CachedOverview {
  cacheKey: string;
  expiresAt: number;
  value: ReturnType<typeof scanWorkspaceFiles>;
}

export class ProjectFilesService {
  private readonly overviewCache = new Map<string, CachedOverview>();

  constructor(private readonly projects: NexusProjectsService) {}

  getOverview(projectId: string, force = false) {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    if (!workspace.settings.projectRoot?.trim()) {
      return {
        root: "",
        generatedAt: new Date().toISOString(),
        synopsis: "Este projeto ainda não foi ligado a uma pasta real. Use a importação de workspace para o Nexus ler os arquivos e entender melhor o contexto.",
        totals: {
          files: 0,
          textFiles: 0,
          directories: 0,
          bytes: 0,
          keyFiles: 0,
          unreadableFiles: 0,
          omittedFiles: 0,
        },
        keyFiles: [],
        directories: [],
        entries: [],
      };
    }

    const root = this.projects.getProjectRoot(projectId);
    const cacheKey = `${root}::${workspace.settings.lastIndexedAt ?? ""}`;
    const cached = this.overviewCache.get(projectId);

    if (!force && cached && cached.cacheKey === cacheKey && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = scanWorkspaceFiles(root);
    this.overviewCache.set(projectId, {
      cacheKey,
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });

    return value;
  }

  readFile(projectId: string, relativePath: string) {
    const workspace = this.projects.getProject(projectId);

    if (!workspace) {
      throw new Error(`Projeto nao encontrado: ${projectId}`);
    }

    if (!workspace.settings.projectRoot?.trim()) {
      throw new Error("Projeto ainda nao esta ligado a uma pasta real.");
    }

    const root = this.projects.getProjectRoot(projectId);
    return readWorkspaceFile(root, relativePath);
  }

  invalidate(projectId: string) {
    this.overviewCache.delete(projectId);
  }
}
