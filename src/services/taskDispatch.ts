import { NexusTask, ProjectWorkspaceSnapshot } from "../projects/types";

function formatDueDate(value?: string) {
  if (!value) {
    return "Sem prazo definido.";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("pt-BR");
}

export function buildTaskExecutionPrompt(snapshot: ProjectWorkspaceSnapshot, task: NexusTask) {
  const openMilestone = (snapshot.milestones ?? []).find((item) => item.status !== "completed");
  const summaryHighlights = (snapshot.summary?.highlights ?? []).slice(0, 3);
  const recentLogs = (snapshot.logs ?? []).slice(0, 3).map((entry) => `${entry.agent}: ${entry.summary}`);

  return [
    `Essa pendencia foi disparada diretamente pela agenda do Nexus. Trate isso como se o usuario tivesse te dado esta instrucao no chat e execute o fluxo completo a partir daqui.`,
    "",
    "Contexto do projeto",
    `Projeto: ${snapshot.project.name}`,
    `Descricao: ${snapshot.project.description || "Sem descricao registrada."}`,
    `Estado atual: ${snapshot.project.state}`,
    `Foco atual do painel: ${snapshot.dashboard?.status?.nextFocus || "Sem foco definido."}`,
    openMilestone
      ? `Marco aberto mais importante: ${openMilestone.title}${openMilestone.description ? ` - ${openMilestone.description}` : ""}`
      : "Marco aberto mais importante: nenhum milestone pendente no momento.",
    "",
    "Pendencia selecionada",
    `Titulo: ${task.title}`,
    `Descricao: ${task.description || "Sem descricao adicional."}`,
    `Prioridade: ${task.priority}`,
    `Prazo: ${formatDueDate(task.dueDate)}`,
    `Status atual da tarefa: ${task.status}`,
    "",
    "Sinais recentes do projeto",
    ...(summaryHighlights.length > 0
      ? summaryHighlights.map((item) => `- ${item}`)
      : ["- Ainda nao ha destaques automaticos suficientes no resumo do projeto."]),
    ...(recentLogs.length > 0
      ? [
          "",
          "Atividade recente",
          ...recentLogs.map((item) => `- ${item}`),
        ]
      : []),
    "",
    "O que fazer",
    "- Analise a pendencia no contexto real deste projeto.",
    "- Execute a parte de backend, logica, integracao e dados que fizer sentido.",
    "- Se houver trabalho de frontend, interface ou UX, delegue ao Antigravity pelo fluxo normal do Nexus.",
    "- Preserve contratos existentes e nao derrube o que ja funciona.",
    "",
    "Entregavel esperado",
    "- Avancar materialmente esta pendencia.",
    "- Deixar claro o que foi feito, o que foi delegado e o que ainda falta validar.",
  ].join("\n");
}
