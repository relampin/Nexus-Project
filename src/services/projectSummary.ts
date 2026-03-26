import { createHash } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { JsonFileStore } from "../core/storage";
import { resolveNexusPath } from "../core/paths";
import {
  NexusMilestone,
  NexusProject,
  NexusProjectLog,
  ProjectPersonalityConfig,
  ProjectPersonalityIntensity,
  NexusTask,
  ProjectAgendaSnapshot,
  ProjectDashboardSnapshot,
  ProjectLogSummary,
  ProjectNarratorData,
  ProjectNarratorMessage,
  ProjectSummaryAudioProvider,
  ProjectSummaryAudioState,
  ProjectSummaryAudioStatus,
  ProjectSummaryData,
  ProjectSummarySection,
  ProjectSummarySnapshot,
} from "../projects/types";
import { TtsService } from "./tts";

interface ProjectSummaryCommand {
  id: string;
  target: string;
  kind: string;
  status: string;
  updatedAt: string;
}

export interface ProjectSummarySource {
  project: NexusProject;
  personality: ProjectPersonalityConfig;
  tasks: NexusTask[];
  milestones: NexusMilestone[];
  logs: NexusProjectLog[];
  agenda: ProjectAgendaSnapshot;
  dashboard: ProjectDashboardSnapshot;
  report: ProjectLogSummary;
  commands: ProjectSummaryCommand[];
}

interface ProjectSummaryAudioRecord {
  projectId: string;
  textHash: string;
  status: ProjectSummaryAudioStatus;
  audioFile: string;
  contentType: string;
  provider: ProjectSummaryAudioProvider;
  voiceId: string;
  generatedAt?: string;
  playbackUpdatedAt?: string;
  error?: string;
}

interface ProjectSummaryAudioRegistry {
  projects: Record<string, ProjectSummaryAudioRecord>;
}

const initialAudioRegistry: ProjectSummaryAudioRegistry = {
  projects: {},
};

export class ProjectSummaryService {
  private readonly store = new JsonFileStore<ProjectSummaryAudioRegistry>(
    resolveNexusPath("data", "project-summary-audio.json"),
    initialAudioRegistry,
  );
  private readonly audioDirectory = resolveNexusPath("data", "tts");
  private readonly pendingNarrations = new Map<string, Promise<void>>();
  private readonly tts = new TtsService(resolveNexusPath("scripts", "synthesize-summary.ps1"));

  buildSummary(source: ProjectSummarySource): ProjectSummarySnapshot {
    const sourceUpdatedAt = this.computeSourceUpdatedAt(source);
    const personality = source.personality;
    const sections = this.buildSections(source, personality);
    const text = this.renderText(source.project.name, sections, source.dashboard.status.nextFocus, personality);
    const audioText = this.renderAudioText(source, sections, personality);
    const textHash = this.hash(audioText);
    const audio = this.buildAudioState(source.project.id, textHash);
    const narrator = this.buildNarrator(source, sections, audio, sourceUpdatedAt, personality);

    return {
      projectId: source.project.id,
      personality,
      summary: {
        title: `Resumo do projeto ${source.project.name}`,
        text,
        lastUpdated: sourceUpdatedAt,
        sourceUpdatedAt,
        sections,
        highlights: sections.find((section) => section.title === "Panorama rápido")?.items ?? [],
        audioUrl: audio.audioUrl,
        status: audio.status,
        audio,
      },
      narrator,
    };
  }

  async ensureNarration(source: ProjectSummarySource) {
    const summary = this.buildSummary(source);
    const projectId = source.project.id;
    const current = this.getAudioRecord(projectId);
    const preferredProfile = this.tts.getPreferredProfile();
    const matchesPreferredVoice = Boolean(
      current
      && current.provider === preferredProfile.provider
      && current.voiceId === preferredProfile.voiceId,
    );
    const matchesFallbackVoice = Boolean(
      current
      && current.provider === "internal"
      && existsSync(current.audioFile),
    );

    if (
      current
      && current.textHash === summary.summary.audio.textHash
      && current.status !== "failed"
      && existsSync(current.audioFile)
      && (matchesPreferredVoice || matchesFallbackVoice)
    ) {
      return this.buildSummary(source);
    }

    const existingPromise = this.pendingNarrations.get(projectId);

    if (existingPromise) {
      await existingPromise;
      return this.buildSummary(source);
    }

    const generationText = this.renderAudioText(source, summary.summary.sections, summary.personality);
    const generation = this.generateNarration(projectId, generationText, summary.summary.audio.textHash ?? this.hash(generationText));
    this.pendingNarrations.set(projectId, generation);

    try {
      await generation;
      return this.buildSummary(source);
    } finally {
      this.pendingNarrations.delete(projectId);
    }
  }

  setPlaybackStatus(source: ProjectSummarySource, status: ProjectSummaryAudioStatus) {
    const summary = this.buildSummary(source);
    const projectId = source.project.id;
    const record = this.getAudioRecord(projectId);

    if (!record || record.textHash !== summary.summary.audio.textHash || !existsSync(record.audioFile)) {
      return summary;
    }

    const state = this.store.read();
    state.projects[projectId] = {
      ...record,
      status,
      playbackUpdatedAt: new Date().toISOString(),
      error: undefined,
    };
    this.store.write(state);
    return this.buildSummary(source);
  }

  async resolveAudioAsset(source: ProjectSummarySource) {
    const summary = await this.ensureNarration(source);
    const record = this.getAudioRecord(source.project.id);

    if (!record || record.textHash !== summary.summary.audio.textHash || !existsSync(record.audioFile)) {
      throw new Error("Áudio do resumo ainda não está pronto.");
    }

    return {
      filePath: record.audioFile,
      contentType: record.contentType,
    };
  }

  private async generateNarration(projectId: string, text: string, textHash: string) {
    mkdirSync(this.audioDirectory, { recursive: true });
    const profile = this.tts.getPreferredProfile();
    const baseFile = join(this.audioDirectory, `${projectId}-summary${profile.extension}`);
    const state = this.store.read();

    state.projects[projectId] = {
      projectId,
      textHash,
      status: "generating",
      audioFile: baseFile,
      contentType: profile.contentType,
      provider: profile.provider,
      voiceId: profile.voiceId,
      playbackUpdatedAt: state.projects[projectId]?.playbackUpdatedAt,
      error: undefined,
    };
    this.store.write(state);

    try {
      const generated = await this.tts.synthesize(text, baseFile);
      const nextState = this.store.read();
      const previousFile = nextState.projects[projectId]?.audioFile;

      if (previousFile && previousFile !== generated.audioFile && existsSync(previousFile)) {
        try {
          unlinkSync(previousFile);
        } catch {
          // O audio antigo nao precisa derrubar o fluxo.
        }
      }

      nextState.projects[projectId] = {
        projectId,
        textHash,
        status: "ready",
        audioFile: generated.audioFile,
        contentType: generated.contentType,
        provider: generated.provider,
        voiceId: generated.voiceId,
        generatedAt: new Date().toISOString(),
        playbackUpdatedAt: nextState.projects[projectId]?.playbackUpdatedAt,
        error: undefined,
      };
      this.store.write(nextState);
    } catch (error) {
      const nextState = this.store.read();
      nextState.projects[projectId] = {
        projectId,
        textHash,
        status: "failed",
        audioFile: nextState.projects[projectId]?.audioFile ?? baseFile,
        contentType: nextState.projects[projectId]?.contentType ?? profile.contentType,
        provider: nextState.projects[projectId]?.provider ?? profile.provider,
        voiceId: nextState.projects[projectId]?.voiceId ?? profile.voiceId,
        generatedAt: nextState.projects[projectId]?.generatedAt,
        playbackUpdatedAt: nextState.projects[projectId]?.playbackUpdatedAt,
        error: error instanceof Error ? error.message : "Falha ao gerar audio do resumo.",
      };
      this.store.write(nextState);
      throw error;
    }
  }

  private buildSections(source: ProjectSummarySource, personality: ProjectPersonalityConfig): ProjectSummarySection[] {
    const recentWins = this.uniqueItems([
      ...source.tasks
        .filter((task) => task.status === "completed")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 2)
        .map((task) => this.withPersonality(
          `task:${task.id}`,
          `Você fechou a tarefa "${task.title}".`,
          personality,
          {
            low: ["Bom, pelo menos esse card saiu do backlog."],
            medium: ["Milagre operacional registrado com sucesso."],
            high: ["Até que enfim esse card saiu do coma administrativo."],
          },
        )),
      ...source.milestones
        .filter((milestone) => milestone.status === "completed")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 1)
        .map((milestone) => this.withPersonality(
          `milestone:${milestone.id}`,
          `O marco "${milestone.title}" já foi concluído.`,
          personality,
          {
            low: ["Nada mal. O roteiro agradece."],
            medium: ["Até o quadro de progresso se convenceu desta vez."],
            high: ["Inacreditavelmente, isso virou item concluído mesmo."],
          },
        )),
      ...source.logs
        .slice(0, 4)
        .map((entry) => this.withPersonality(
          `log:${entry.id}`,
          this.toFriendlyLog(entry),
          personality,
          {
            low: ["Seguiu o fluxo sem drama extra."],
            medium: ["Sim, alguma coisa de fato andou."],
            high: ["Contra algumas expectativas, funcionou."],
          },
        )),
    ]).slice(0, 4);

    const inFlight = this.uniqueItems([
      ...source.tasks
        .filter((task) => task.status === "in_progress")
        .slice(0, 3)
        .map((task) => this.withPersonality(
          `inflight-task:${task.id}`,
          `Agora o foco está em "${task.title}".`,
          personality,
          {
            low: ["Finalmente alguém escolheu uma frente para puxar."],
            medium: ["Pelo menos o caos agora tem nome e sobrenome."],
            high: ["Que bom, porque improviso eterno não era plano de execução."],
          },
        )),
      ...source.milestones
        .filter((milestone) => milestone.status === "in_progress")
        .slice(0, 2)
        .map((milestone) => this.withPersonality(
          `inflight-milestone:${milestone.id}`,
          `O marco "${milestone.title}" segue puxando a frente principal.`,
          personality,
          {
            low: ["Ou seja: ainda tem gente empurrando isso para frente."],
            medium: ["Milagres pequenos, mas consistentes."],
            high: ["A locomotiva está andando, mesmo sem glamour."],
          },
        )),
      ...source.commands
        .filter((command) => command.status === "processing" || command.status === "awaiting_external")
        .slice(0, 2)
        .map((command) => this.withPersonality(
          `command:${command.id}`,
          this.toFriendlyCommand(command),
          personality,
          {
            low: ["Pelo menos não está parado."],
            medium: ["Choquei ninguém ao dizer que ainda depende de acompanhamento."],
            high: ["Sim, mais uma frente precisando de supervisão humana básica."],
          },
        )),
    ]).slice(0, 4);

    const attentionItems = this.uniqueItems([
      ...source.agenda.overdue
        .slice(0, 2)
        .map((task) => this.withPersonality(
          `overdue:${task.id}`,
          `Vale atacar "${task.title}" primeiro, porque esse item já estourou o prazo.`,
          personality,
          {
            low: ["O calendário percebeu antes da gente."],
            medium: ["A surpresa aqui é só fingir que isso era opcional."],
            high: ["O prazo passou e levou a paciência junto."],
          },
        )),
      ...source.tasks
        .filter((task) => task.status === "pending")
        .sort((left, right) => this.compareTaskPriority(left, right))
        .slice(0, 3)
        .map((task) => task.dueDate
          ? this.withPersonality(
            `pending-due:${task.id}`,
            `Ainda falta encaixar "${task.title}" antes de ${task.dueDate}.`,
            personality,
            {
              low: ["Ainda dá tempo de não transformar isso em incêndio."],
              medium: ["Seria elegante agir antes do prazo virar lenda."],
              high: ["Se esperar mais, esse prazo vira decoração."],
            },
          )
          : this.withPersonality(
            `pending:${task.id}`,
            `Ainda falta colocar "${task.title}" em movimento.`,
            personality,
            {
              low: ["No momento ele está praticando repouso absoluto."],
              medium: ["A famosa fase de contemplação eterna."],
              high: ["Esse item está parado com muita convicção."],
            },
          )),
      source.dashboard.status.nextFocus !== "Sem bloqueios imediatos."
        ? this.withPersonality(
          `next-focus:${source.project.id}`,
          `O próximo passo que mais destrava o projeto é "${source.dashboard.status.nextFocus}".`,
          personality,
          {
            low: ["Não é mistério, só precisa acontecer."],
            medium: ["O mapa está dado. Falta combinar com a execução."],
            high: ["A resposta está na tela. Ignorar já vira escolha consciente."],
          },
        )
        : "",
    ]).slice(0, 4);

    const highlights = this.uniqueItems([
      this.withPersonality(
        `highlight-progress:${source.project.id}`,
        `O progresso geral está em ${source.dashboard.progress.overallPct}%.`,
        personality,
        {
          low: ["Devagar, mas existe número para provar."],
          medium: ["Não é lenda urbana: tem progresso mesmo."],
          high: ["Lento em alguns momentos, mas matematicamente impossível negar."],
        },
      ),
      this.withPersonality(
        `highlight-tasks:${source.project.id}`,
        `Hoje o painel marca ${source.dashboard.tasks.completed} tarefa(s) concluída(s) e ${source.dashboard.tasks.pending} pendência(s) abertas.`,
        personality,
        {
          low: ["Ou seja: teve entrega e ainda sobrou diversão para depois."],
          medium: ["A pilha diminuiu um pouco. O backlog não gostou."],
          high: ["Metade avançou, metade segue encarando o teto."],
        },
      ),
      source.dashboard.status.overdueTasks > 0
        ? this.withPersonality(
          `highlight-overdue:${source.project.id}`,
          `Tem ${source.dashboard.status.overdueTasks} item(ns) atrasado(s) pedindo atenção.`,
          personality,
          {
            low: ["Nada terminal, mas vale não colecionar mais."],
            medium: ["O calendário fez a parte dele. Agora somos nós."],
            high: ["A agenda está cobrando com certa razão."],
          },
        )
        : this.withPersonality(
          `highlight-overdue-clear:${source.project.id}`,
          "Não apareceu nada atrasado no radar agora.",
          personality,
          {
            low: ["Sim, eu também estranhei positivamente."],
            medium: ["Milagre pequeno, mas elegante."],
            high: ["Aparentemente alguém decidiu respeitar prazo hoje."],
          },
        ),
      source.dashboard.queue.awaitingExternal > 0
        ? this.withPersonality(
          `highlight-queue:${source.project.id}`,
          `Existe ${source.dashboard.queue.awaitingExternal} entrega aguardando outro agente.`,
          personality,
          {
            low: ["Ou seja: vale acompanhar sem drama."],
            medium: ["Dependência externa, esse clássico da produtividade moderna."],
            high: ["Mais um capítulo de 'agora depende dos outros'."],
          },
        )
        : this.withPersonality(
          `highlight-queue-clear:${source.project.id}`,
          "Não há dependência externa travando o projeto neste momento.",
          personality,
          {
            low: ["Raro e bonito de ver."],
            medium: ["A fila está limpa. Aproveita antes que alguém estrague."],
            high: ["Nem acredito que posso dizer isso sem rir."],
          },
        ),
      this.withPersonality(
        `highlight-level:${source.project.id}`,
        `O projeto está no nível ${source.dashboard.gamification.level}, com ${source.dashboard.gamification.experiencePoints} XP acumulados.`,
        personality,
        {
          low: ["Gamificação funcionando sem precisar de fanfarra."],
          medium: ["Subiu de nível sem cutscene, mas subiu."],
          high: ["XP entrou. Heroísmo talvez seja exagero, mas trabalho houve."],
        },
      ),
    ]).slice(0, 5);

    return [
      {
        title: "O que andou bem",
        items: recentWins.length > 0 ? recentWins : ["Ainda não tem movimentação suficiente para contar uma vitória recente aqui."],
      },
      {
        title: "No que a gente está agora",
        items: inFlight.length > 0 ? inFlight : ["Não apareceu nada em andamento agora, então o melhor passo é puxar a próxima frente da fila."],
      },
      {
        title: "O que merece atenção",
        items: attentionItems.length > 0 ? attentionItems : ["O backlog imediato está respirando bem e sem alerta gritante no momento."],
      },
      {
        title: "Panorama rápido",
        items: highlights,
      },
    ];
  }

  private renderText(
    projectName: string,
    sections: ProjectSummarySection[],
    nextFocus: string,
    personality: ProjectPersonalityConfig,
  ) {
    const opener = personality.mode === "sarcastic"
      ? this.pickIntensityVariant(`opener:${projectName}`, personality.intensity, {
        low: [
          `Panorama rápido de ${projectName}: tem progresso real aqui, o que já ajuda bastante.`,
          `Resumo direto de ${projectName}: o projeto andou e não foi só no campo das boas intenções.`,
        ],
        medium: [
          `Panorama rápido de ${projectName}: progresso detectado. Lento em alguns pontos, mas detectado.`,
          `Resumo direto de ${projectName}: o projeto andou de verdade, apesar de algumas ambições dramáticas do backlog.`,
        ],
        high: [
          `Panorama rápido de ${projectName}: finalmente dá para chamar isso de avançar sem forçar a barra.`,
          `Resumo direto de ${projectName}: saiu coisa do papel. O impossível tirou o dia de folga.`,
        ],
      })
      : this.pickVariant(projectName, [
        `Panorama rápido de ${projectName}: você ganhou tração real aqui.`,
        `Resumo direto de ${projectName}: o projeto segue andando e dá para ver progresso.`,
        `Visão geral de ${projectName}: tem trabalho entregue, foco definido e alguns pontos para acompanhar.`,
      ]);

    const closer = nextFocus !== "Sem bloqueios imediatos."
      ? this.withPersonality(
        `closer:${projectName}:${nextFocus}`,
        `Se quiser manter o ritmo, a melhor próxima puxada é ${nextFocus}.`,
        personality,
        {
          low: ["O caminho está bem exposto."],
          medium: ["Não é mistério. Só precisa virar movimento."],
          high: ["A próxima jogada está óbvia o bastante para não precisar de ritual."],
        },
      )
      : this.withPersonality(
        `closer:${projectName}:clean`,
        "Se quiser manter o ritmo, vale escolher a próxima frente do backlog enquanto o terreno está limpo.",
        personality,
        {
          low: ["Tá tudo ajeitado para puxar algo útil."],
          medium: ["Momento raro em que o caos deu uma respirada."],
          high: ["A janela esta limpa. Melhor usar antes que o backlog lembre que existe."],
        },
      );

    return [
      opener,
      "",
      ...sections.flatMap((section) => [
        `${section.title}:`,
        ...section.items.map((item) => `- ${item}`),
        "",
      ]),
      closer,
    ].join("\n").trim();
  }

  private renderAudioText(
    source: ProjectSummarySource,
    sections: ProjectSummarySection[],
    personality: ProjectPersonalityConfig,
  ) {
    const fullSummary = this.renderText(
      source.project.name,
      sections,
      source.dashboard.status.nextFocus,
      personality,
    );
    const narrator = this.buildNarrator(
      source,
      sections,
      {
        status: "idle",
        contentType: "audio/mpeg",
        provider: "elevenlabs",
        voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || "eleven-default",
        textHash: "",
      },
      this.computeSourceUpdatedAt(source),
      personality,
    );
    const highlights = sections.find((section) => section.title === "Panorama rÃ¡pido")?.items ?? [];

    return [
      `Leitura completa do resumo do projeto ${source.project.name}.`,
      "Narrador:",
      ...narrator.messages.map((message) => message.text),
      "",
      "Destaques:",
      ...highlights,
      "",
      fullSummary,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  private buildNarrator(
    source: ProjectSummarySource,
    sections: ProjectSummarySection[],
    audio: ProjectSummaryAudioState,
    sourceUpdatedAt: string,
    personality: ProjectPersonalityConfig,
  ): ProjectNarratorData {
    const messages = this.uniqueNarratorMessages([
      {
        text: this.withPersonality(
          `narrator-progress:${source.project.id}`,
          this.pickVariant(source.project.id, [
            `O projeto ${source.project.name} já bateu ${source.dashboard.progress.overallPct}% de progresso geral.`,
            `Resumo do momento: ${source.project.name} está em ${source.dashboard.progress.overallPct}% e continua andando.`,
            `Tem avanços visíveis em ${source.project.name}; o painel marca ${source.dashboard.progress.overallPct}% de progresso.`,
          ]),
          personality,
          {
            low: ["Nada extravagante, mas claramente melhor do que ficar patinando."],
            medium: ["Olha só, produtividade apareceu e deixou rastro."],
            high: ["Achei que esse número ia demorar mais para subir, confesso."],
          },
        ),
        timestamp: sourceUpdatedAt,
        priority: "medium",
        audioUrl: audio.audioUrl ?? null,
      },
      {
        text: sections[1]?.items[0] ?? this.withPersonality(
          `narrator-focus:${source.project.id}`,
          "No momento, o projeto está entre uma frente concluída e a próxima puxada do backlog.",
          personality,
          {
            low: ["Pelo menos o radar do que vem agora está ligado."],
            medium: ["A pauta existe. Já é um bom início civilizatório."],
            high: ["Sem roteiro não dá. Felizmente um apareceu."],
          },
        ),
        timestamp: sourceUpdatedAt,
        priority: "medium",
        audioUrl: audio.audioUrl ?? null,
      },
      {
        text: source.dashboard.status.overdueTasks > 0
          ? this.withPersonality(
            `narrator-overdue:${source.project.id}`,
            `Atenção rápida: tem ${source.dashboard.status.overdueTasks} item(ns) atrasado(s) no projeto.`,
            personality,
            {
              low: ["Nada irreversível, mas o calendário está chamando."],
              medium: ["O prazo claramente acreditou mais no plano do que a execução acreditou nele."],
              high: ["O calendário fez a parte dele. Agora a vergonha é opcional."],
            },
          )
          : this.withPersonality(
            `narrator-clear:${source.project.id}`,
            "Boa notícia: não apareceu nada atrasado no radar agora.",
            personality,
            {
              low: ["Sim, é um estado válido do universo."],
              medium: ["Eu também estranhei, mas vou aceitar."],
              high: ["Não vou reclamar de um milagre logístico desses."],
            },
          ),
        timestamp: sourceUpdatedAt,
        priority: source.dashboard.status.overdueTasks > 0 ? "high" : "low",
        audioUrl: audio.audioUrl ?? null,
      },
    ]);

    return {
      lastUpdated: sourceUpdatedAt,
      messages,
    };
  }

  private buildAudioState(projectId: string, textHash: string): ProjectSummaryAudioState {
    const record = this.getAudioRecord(projectId);
    const preferredProfile = this.tts.getPreferredProfile();
    const isCurrent = Boolean(
      record
      && record.textHash === textHash
      && (
        (record.provider === preferredProfile.provider && record.voiceId === preferredProfile.voiceId)
        || record.provider === "internal"
      ),
    );
    const hasPlayableAudio = Boolean(
      isCurrent
      && record
      && existsSync(record.audioFile)
      && (record.status === "ready" || record.status === "playing" || record.status === "paused"),
    );
    const status = isCurrent
      ? record?.status ?? "idle"
      : "idle";
    const audioUrl = hasPlayableAudio
      ? `/projects/${projectId}/summary/audio?v=${textHash}`
      : undefined;

    return {
      status,
      audioUrl,
      contentType: isCurrent ? record?.contentType ?? preferredProfile.contentType : preferredProfile.contentType,
      generatedAt: isCurrent ? record?.generatedAt : undefined,
      playbackUpdatedAt: isCurrent ? record?.playbackUpdatedAt : undefined,
      provider: isCurrent ? record?.provider ?? preferredProfile.provider : preferredProfile.provider,
      voiceId: isCurrent ? record?.voiceId ?? preferredProfile.voiceId : preferredProfile.voiceId,
      error: isCurrent ? record?.error : undefined,
      textHash,
    };
  }

  private getAudioRecord(projectId: string) {
    return this.store.read().projects[projectId];
  }

  private computeSourceUpdatedAt(source: ProjectSummarySource) {
    const candidates = [
      source.project.createdAt,
      ...source.tasks.map((task) => task.updatedAt),
      ...source.milestones.map((milestone) => milestone.updatedAt),
      ...source.logs.map((entry) => entry.timestamp),
      ...source.commands.map((command) => command.updatedAt),
    ].filter(Boolean);

    return candidates.sort().at(-1) ?? new Date().toISOString();
  }

  private compareTaskPriority(left: NexusTask, right: NexusTask) {
    const order = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    } as const;

    const priorityGap = order[left.priority] - order[right.priority];

    if (priorityGap !== 0) {
      return priorityGap;
    }

    if (left.dueDate && right.dueDate) {
      return left.dueDate.localeCompare(right.dueDate);
    }

    if (left.dueDate) {
      return -1;
    }

    if (right.dueDate) {
      return 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  }

  private uniqueItems(items: string[]) {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const item of items.map((entry) => entry.trim()).filter(Boolean)) {
      const key = this.normalize(item);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(item);
    }

    return output;
  }

  private uniqueNarratorMessages(messages: ProjectNarratorMessage[]) {
    const seen = new Set<string>();
    const output: ProjectNarratorMessage[] = [];

    for (const message of messages) {
      const key = this.normalize(message.text);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(message);
    }

    return output;
  }

  private toFriendlyLog(entry: NexusProjectLog) {
    const loweredSummary = this.lowercaseFirst(entry.summary);

    if (entry.action === "antigravity.review") {
      return loweredSummary.includes("ressalvas")
        ? "A última entrega visual passou na revisão, mas ainda deixou pequenos pontos de ajuste."
        : "A última entrega visual passou na revisão do Nexus.";
    }

    if (entry.action.endsWith(".completed")) {
      return entry.agent === "antigravity"
        ? "O Antigravity fechou uma frente importante do painel."
        : entry.agent === "codex"
          ? "O Codex fechou uma frente técnica importante do projeto."
          : `O sistema registrou que ${loweredSummary}`;
    }

    if (entry.action === "project.update") {
      return "O contexto do projeto foi ajustado para refletir a fase atual.";
    }

    return entry.agent === "system"
      ? `O sistema apontou que ${loweredSummary}`
      : `${entry.agent === "antigravity" ? "O Antigravity" : "O Codex"} registrou que ${loweredSummary}`;
  }

  private toFriendlyCommand(command: ProjectSummaryCommand) {
    if (command.status === "awaiting_external") {
      return command.target === "antigravity"
        ? "Tem uma frente visual em andamento com o Antigravity aguardando fechamento."
        : `Tem uma frente aguardando resposta de ${command.target}.`;
    }

    return `Tem uma frente do tipo ${command.kind} rodando agora com ${command.target}.`;
  }

  private withPersonality(
    seed: string,
    info: string,
    personality: ProjectPersonalityConfig,
    tails: Partial<Record<ProjectPersonalityIntensity, string[]>>,
  ) {
    if (personality.mode !== "sarcastic") {
      return info;
    }

    const tail = this.pickIntensityVariant(seed, personality.intensity, {
      low: tails.low ?? tails.medium ?? [],
      medium: tails.medium ?? tails.low ?? [],
      high: tails.high ?? tails.medium ?? [],
    });

    return tail ? `${info} ${tail}` : info;
  }

  private lowercaseFirst(value: string) {
    return value.length > 0
      ? `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`
      : value;
  }

  private hash(value: string) {
    return createHash("sha1").update(value).digest("hex");
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private pickVariant(seed: string, variants: string[]) {
    if (variants.length === 0) {
      return "";
    }

    const digest = this.hash(seed);
    const index = parseInt(digest.slice(0, 8), 16) % variants.length;
    return variants[index];
  }

  private pickIntensityVariant(
    seed: string,
    intensity: ProjectPersonalityIntensity,
    variants: Record<ProjectPersonalityIntensity, string[]>,
  ) {
    return this.pickVariant(`${seed}:${intensity}`, variants[intensity] ?? []);
  }
}
