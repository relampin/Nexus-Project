import { existsSync } from "node:fs";
import { basename, relative } from "node:path";
import { CommandRecord, ExternalDispatch, QueueStats } from "../core/types";
import { AntigravityReviewReport } from "./antigravityGuard";

const relevantEntries = [
  "README.md",
  "package.json",
  "docs",
  "src",
  "backend",
  "frontend",
  "scripts",
  "assets",
  "bridge",
  "log",
] as const;

function getProjectRootRelativePath(projectRoot: string, targetPath: string) {
  const relativePath = relative(projectRoot, targetPath);
  return relativePath || ".";
}

function getProjectRootLabel(projectRoot: string) {
  return basename(projectRoot) || projectRoot;
}

function getRelevantProjectPaths(projectRoot: string) {
  return relevantEntries
    .map((entry) => ({
      entry,
      absolutePath: `${projectRoot}\\${entry}`,
    }))
    .filter(({ absolutePath }) => existsSync(absolutePath));
}

function getCommandText(command: CommandRecord) {
  return String(command.payload.text ?? "").trim() || "Sem texto adicional no payload.";
}

function formatRelevantPaths(projectRoot: string, relevantPaths: Array<{ entry: string; absolutePath: string }>) {
  return relevantPaths.map(({ entry, absolutePath }) => `- ${entry}: ${getProjectRootRelativePath(projectRoot, absolutePath)}`);
}

function getRestrictionLines(monitor: ExternalDispatch["monitor"] | undefined, projectRoot: string) {
  const lines = [
    "- Nao quebre integracoes, contratos ou dados existentes.",
    "- Nao saia do escopo necessario para concluir esta tarefa.",
  ];

  if (monitor?.enabled) {
    lines.push(`- Priorize mudancas em: ${monitor.allowedPaths.join(", ")}.`);
    lines.push(`- Nao mexa em: ${monitor.blockedPaths.join(", ")}.`);
    lines.push("- O Nexus monitora os arquivos alterados. Ajustes pequenos de apoio fora da area principal podem gerar ressalva, mas so areas protegidas bloqueiam a entrega.");
  }

  lines.push(`- Considere ${getProjectRootLabel(projectRoot)} como a raiz oficial deste trabalho.`);
  return lines;
}

export function buildAntigravityRequestBody(
  command: CommandRecord,
  _queueStats: QueueStats,
  requestFile: string,
  logFile: string,
  monitor: ExternalDispatch["monitor"] | undefined,
  projectRoot: string,
) {
  const relevantPaths = getRelevantProjectPaths(projectRoot);
  const relativeLogFile = getProjectRootRelativePath(projectRoot, logFile);
  const relativeRequestFile = getProjectRootRelativePath(projectRoot, requestFile);

  return [
    "## Contexto",
    "",
    `O projeto ${getProjectRootLabel(projectRoot)} esta numa etapa em que o backend e a integracao principal ja foram organizados, e agora a frente visual precisa andar sem perder esse contrato.`,
    "Do lado de ca, eu vou manter logica, dados, estabilidade e validacao.",
    `O trabalho desta rodada e: ${getCommandText(command)}`,
    "",
    "## Situacao atual",
    "",
    "Use o codigo real no disco como fonte de verdade, nao contexto antigo de conversa.",
    `Se precisar recuperar este handoff depois, a referencia completa ficou em ${relativeRequestFile}.`,
    "Antes de mexer, leia o que ja existe e entenda o estado real do projeto.",
    ...formatRelevantPaths(projectRoot, relevantPaths),
    "",
    "## Raiz correta de trabalho",
    "",
    `A raiz correta deste job e ${getProjectRootLabel(projectRoot)}.`,
    "Trate essa pasta como o alvo oficial da entrega.",
    ...(monitor?.enabled ? [
      `Nesta rodada, concentre o trabalho em: ${monitor.allowedPaths.join(", ")}.`,
      `As areas protegidas sao: ${monitor.blockedPaths.join(", ")}.`,
    ] : []),
    "",
    "## Tarefa",
    "",
    "- Leia primeiro a interface real e os contratos que ela consome.",
    "- Corrija ou construa o necessario para resolver a frente visual pedida.",
    "- Preserve backend, integracoes, contratos, persistencia e qualquer comportamento que ja esteja funcionando.",
    "- Dentro do frontend, voce tem liberdade para reorganizar layout, hierarquia visual, responsividade e acabamento, desde que respeite o contrato do backend.",
    "- Se surgir necessidade real de tocar em contrato ou backend, faca a mudanca minima possivel e explique isso no log.",
    "",
    "## Entregavel",
    "",
    "- Entrega pronta no frontend, coerente com o contrato atual do projeto.",
    `- O fechamento oficial deste trabalho deve ser registrado em ${relativeLogFile}.`,
    "- O log final deve usar as secoes: O que recebi, Objetivo, Arquivos inspecionados, Arquivos alterados, O que fiz, O que deleguei, O que falta validar.",
    "- Deixe claro no log como voce validou o resultado final.",
    "- O Nexus revisa automaticamente o log e os arquivos alterados antes de aprovar o job.",
    "",
    "## Restricoes",
    "",
    ...getRestrictionLines(monitor, projectRoot),
  ].join("\n");
}

export function buildAntigravityTelegramMessage(command: CommandRecord) {
  const projectRoot = command.external?.projectRoot ?? process.cwd();
  const requestFile = command.external?.requestFile ?? "nao informado";
  const logFile = command.external?.logFile ?? command.external?.responseFile ?? "nao informado";
  const relativeLogFile = getProjectRootRelativePath(projectRoot, logFile);
  const relativeRequestFile = getProjectRootRelativePath(projectRoot, requestFile);
  const relevantPaths = getRelevantProjectPaths(projectRoot);

  return [
    `O projeto ${getProjectRootLabel(projectRoot)} precisa da sua frente no frontend novamente.`,
    "",
    "Contexto",
    "",
    getCommandText(command),
    "",
    "Situacao atual",
    "",
    `O handoff completo ficou em ${relativeRequestFile}.`,
    "Leia o projeto real antes de alterar qualquer arquivo.",
    ...formatRelevantPaths(projectRoot, relevantPaths),
    "",
    "Raiz correta de trabalho",
    "",
    `Trabalhe na pasta ${getProjectRootLabel(projectRoot)}.`,
    ...(command.external?.monitor?.enabled ? [
      `A area principal desta tarefa e: ${command.external.monitor.allowedPaths.join(", ")}.`,
      `Nao mexa em: ${command.external.monitor.blockedPaths.join(", ")}.`,
    ] : []),
    "",
    "Entregavel",
    "",
    `Feche este trabalho com log em ${relativeLogFile}.`,
    "- Use no log as secoes: O que recebi, Objetivo, Arquivos inspecionados, Arquivos alterados, O que fiz, O que deleguei, O que falta validar.",
    "- Deixe explicito como voce validou o resultado.",
  ].join("\n");
}

export function buildAntigravityIdePrompt(command: CommandRecord) {
  const projectRoot = command.external?.projectRoot ?? process.cwd();
  const requestFile = command.external?.requestFile ?? "nao informado";
  const logFile = command.external?.logFile ?? command.external?.responseFile ?? "nao informado";
  const relativeLogFile = getProjectRootRelativePath(projectRoot, logFile);
  const relativeRequestFile = getProjectRootRelativePath(projectRoot, requestFile);

  return [
    `Preciso que voce retome um trabalho no projeto ${getProjectRootLabel(projectRoot)}.`,
    "",
    "## Contexto",
    "",
    getCommandText(command),
    "",
    "## Situacao atual",
    "",
    `O handoff completo ficou em ${relativeRequestFile}.`,
    "Use o codigo real do projeto como fonte de verdade antes de alterar qualquer arquivo.",
    "",
    "## Raiz correta de trabalho",
    "",
    `Trabalhe na pasta ${getProjectRootLabel(projectRoot)}.`,
    ...(command.external?.monitor?.enabled ? [
      `A area principal desta tarefa e: ${command.external.monitor.allowedPaths.join(", ")}.`,
      `Nao mexa em: ${command.external.monitor.blockedPaths.join(", ")}.`,
      "O Nexus monitora os arquivos alterados automaticamente, mas so areas protegidas bloqueiam a entrega.",
    ] : []),
    "",
    "## Tarefa",
    "",
    "- Leia o projeto real antes de agir.",
    "- Nao assuma stack ou arquitetura sem inspecionar.",
    "- Preserve o que ja funciona.",
    "- Dentro do frontend, voce tem liberdade para melhorar layout, composicao visual e responsividade, desde que respeite o contrato.",
    "- Mantenha backend, integracoes, contratos e dados compativeis.",
    "",
    "## Entregavel",
    "",
    `- Escrever o log final em ${relativeLogFile}.`,
    "- O log precisa usar as secoes: O que recebi, Objetivo, Arquivos inspecionados, Arquivos alterados, O que fiz, O que deleguei, O que falta validar.",
    "- Diga no log como validou o resultado final.",
    "- O Nexus vai revisar automaticamente os arquivos alterados e o log antes de aprovar o job.",
  ].join("\n");
}

export function buildAntigravityCorrectionPrompt(
  command: CommandRecord,
  review: AntigravityReviewReport,
  reviewFile?: string,
) {
  const projectRoot = command.external?.projectRoot ?? process.cwd();
  const requestFile = command.external?.requestFile ?? "nao informado";
  const logFile = command.external?.logFile ?? command.external?.responseFile ?? "nao informado";
  const relativeLogFile = getProjectRootRelativePath(projectRoot, logFile);
  const relativeReviewFile = reviewFile ? getProjectRootRelativePath(projectRoot, reviewFile) : "nao informado";
  const relativeRequestFile = getProjectRootRelativePath(projectRoot, requestFile);

  return [
    "Estou te devolvendo este trabalho porque a entrega anterior nao passou na revisao do Nexus.",
    "",
    "Contexto",
    "",
    "A tarefa continua a mesma do handoff original, mas agora voce precisa corrigir problemas objetivos encontrados na revisao.",
    "",
    "Situacao atual",
    "",
    `- ${review.summary}`,
    ...(review.missingLogSections.length > 0 ? [`- secoes faltando no log: ${review.missingLogSections.join(", ")}`] : []),
    ...(review.violatingFiles.length > 0 ? [`- fora do escopo: ${review.violatingFiles.join(", ")}`] : []),
    ...(review.undeclaredChangedFiles.length > 0 ? [`- arquivos alterados nao declarados no log: ${review.undeclaredChangedFiles.join(", ")}`] : []),
    ...(review.warnings.length > 0 ? review.warnings.map((warning) => `- alerta: ${warning}`) : []),
    "",
    "Raiz correta de trabalho",
    "",
    `Continue trabalhando em ${getProjectRootLabel(projectRoot)}.`,
    "",
    "Tarefa",
    "",
    "- corrigir os problemas apontados acima",
    "- preservar o objetivo original da tarefa",
    "- manter o trabalho dentro do escopo permitido",
    "- atualizar o log final com as secoes obrigatorias e com a validacao do resultado",
    "",
    "Entregavel",
    "",
    `- use ${relativeRequestFile} como referencia do handoff original`,
    `- use ${relativeReviewFile} como referencia desta revisao`,
    `- atualize o log final em ${relativeLogFile}`,
    "- depois de corrigir, finalize novamente pelo log",
  ].join("\n");
}
