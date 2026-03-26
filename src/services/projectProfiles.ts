import { NexusProject, NexusProjectSettings, ProjectProfileDefinition, ProjectProfileId } from "../projects/types";

const PROFILE_DEFINITIONS: Record<ProjectProfileId, ProjectProfileDefinition> = {
  general: {
    id: "general",
    label: "Projeto Geral",
    description: "Workspace generico com fluxo livre e foco em organizar backlog, execucao e observabilidade.",
    focusAreas: ["contexto", "tarefas", "observabilidade"],
  },
  web_app: {
    id: "web_app",
    label: "App Web",
    description: "Projeto com interface, navegacao, dados e integracao entre frontend e backend.",
    focusAreas: ["ux", "integracao", "entrega de tela"],
  },
  backend_service: {
    id: "backend_service",
    label: "Servico Backend",
    description: "Servico focado em API, regras de negocio, estabilidade e validacao automatica.",
    focusAreas: ["api", "dados", "validacao"],
  },
  automation: {
    id: "automation",
    label: "Automacao",
    description: "Projeto voltado a rotinas, integracoes, execucao programatica e confiabilidade operacional.",
    focusAreas: ["rotinas", "integracao", "confiabilidade"],
  },
  site: {
    id: "site",
    label: "Site",
    description: "Projeto de experiencia web com conteudo, apresentacao e jornada clara.",
    focusAreas: ["conteudo", "layout", "performance"],
  },
  ai_hub: {
    id: "ai_hub",
    label: "Hub de IA",
    description: "Sistema de orquestracao entre agentes, observabilidade e execucao multiagente.",
    focusAreas: ["agentes", "monitoramento", "fluxo operacional"],
  },
};

export function listProjectProfiles() {
  return Object.values(PROFILE_DEFINITIONS);
}

export function getProjectProfileById(profileId?: ProjectProfileId) {
  return profileId ? PROFILE_DEFINITIONS[profileId] : undefined;
}

export function resolveProjectProfile(project: NexusProject, settings?: NexusProjectSettings): ProjectProfileDefinition {
  if (settings?.profileId && PROFILE_DEFINITIONS[settings.profileId]) {
    return PROFILE_DEFINITIONS[settings.profileId];
  }

  const combined = [
    project.name,
    project.description,
    settings?.stackHint,
    settings?.projectRoot,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(nexus|codex|antigravity|agente|orquestr)/.test(combined)) {
    return PROFILE_DEFINITIONS.ai_hub;
  }

  if (/(site|landing|institucional|conteudo)/.test(combined)) {
    return PROFILE_DEFINITIONS.site;
  }

  if (/(automacao|bot|workflow|pipeline|job)/.test(combined)) {
    return PROFILE_DEFINITIONS.automation;
  }

  if (/(express|api|backend|server|servico)/.test(combined) && !/(frontend|react|next|vite|web)/.test(combined)) {
    return PROFILE_DEFINITIONS.backend_service;
  }

  if (/(react|next|vite|frontend|web|dashboard|painel|ui|ux)/.test(combined)) {
    return PROFILE_DEFINITIONS.web_app;
  }

  return PROFILE_DEFINITIONS.general;
}
