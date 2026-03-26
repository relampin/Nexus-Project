# Nexus Multiproject Dashboard Contract

## Contexto

O Nexus esta deixando de ser apenas um despachante de comandos e passando a funcionar como um painel multi-projetos. A partir desta fase, o frontend precisa tratar projetos, agenda, progresso, logs por IA e navegacao entre contextos como entidades de primeira classe.

O backend continua sendo o ponto de verdade para:

- projetos e projeto ativo global
- tarefas e agenda por projeto
- milestones e barras de progresso
- logs estruturados por projeto
- resumos automaticos por projeto e narracao do resumo
- estado da fila e jobs delegados

O frontend deve consumir esses dados dinamicamente. Nao deve embutir listas fixas, estados hardcoded ou mockar a estrutura principal do painel.

## Raiz correta de trabalho

O frontend do proprio Nexus fica em `frontend/`.

Os arquivos de backend e contrato que valem leitura antes de construir a interface ficam em:

- `src/projects/`
- `src/routes/projects.ts`
- `src/routes/ui.ts`
- `src/services/runtime.ts`
- `src/server.ts`

## Endpoints principais

### Bootstrap do painel

`GET /ui/bootstrap`

Entrega o estado inicial do painel. Esse payload ja traz:

- `stats`: estado global da fila
- `audit`: resumo da auditoria automatica do Nexus
- `projects`: lista de projetos com resumo e dashboard de cada um
- `activeProject`: snapshot completo do projeto ativo
- `commands`: comandos recentes do projeto ativo
- `activity`: atividade global do Nexus
- `projectActivity`: logs recentes do projeto ativo
- `antigravitySession`: snapshot monitorado da sessao visivel do Antigravity
- `manualAssist`: jobs aguardando agente no projeto ativo

### Projetos

`GET /projects`

Lista todos os projetos e indica qual esta ativo.

`POST /projects`

Cria um projeto novo.

Se `settings.projectRoot` vier preenchido, o Nexus trata essa criacao como importacao de workspace: le a pasta real, tenta inferir stack, semeia progresso inicial e registra logs de onboarding e historico local.

Payload base:

```json
{
  "name": "Novo projeto",
  "description": "Descricao opcional",
  "state": "active",
  "settings": {
    "projectRoot": "C:\\caminho\\opcional",
    "colorToken": "#55c271",
    "icon": "rocket",
    "personalityMode": "sarcastic",
    "personalityIntensity": "medium",
    "stackHint": "Node.js, TypeScript",
    "lastIndexedAt": "2026-03-25T19:00:00.000Z"
  }
}
```

`POST /projects/:projectId/rescan`

Reindexa o workspace do projeto a partir de `settings.projectRoot`, atualizando tarefas e milestones automaticos do onboarding e renovando logs de descoberta.

`GET /projects/active`

Retorna o snapshot completo do projeto ativo.

`PUT /projects/active`

Troca o projeto ativo global.

```json
{
  "projectId": "uuid"
}
```

`GET /projects/:projectId`

Retorna o snapshot completo de um projeto.

`PATCH /projects/:projectId`

Atualiza nome, descricao, estado ou `settings`.

`DELETE /projects/:projectId`

Exclui um projeto.

### Tarefas

`GET /projects/:projectId/tasks`

Retorna:

- `items`: lista de tarefas
- `agenda`: agrupamento em `overdue`, `today`, `upcoming`, `withoutDueDate`, `completed`

`POST /projects/:projectId/tasks`

```json
{
  "title": "Corrigir tela de dashboard",
  "description": "Opcional",
  "status": "pending",
  "priority": "high",
  "dueDate": "2026-03-26"
}
```

`PATCH /projects/:projectId/tasks/:taskId`

Atualiza qualquer campo editavel da tarefa.

`DELETE /projects/:projectId/tasks/:taskId`

Remove a tarefa.

### Milestones

`GET /projects/:projectId/milestones`

`POST /projects/:projectId/milestones`

```json
{
  "title": "Primeira versao do painel",
  "description": "Opcional",
  "status": "in_progress",
  "targetDate": "2026-03-29"
}
```

`PATCH /projects/:projectId/milestones/:milestoneId`

`DELETE /projects/:projectId/milestones/:milestoneId`

### Logs e relatorios

`GET /projects/:projectId/logs`

Retorna:

- `items`: logs estruturados do projeto
- `report`: resumo automatizavel por agente

`GET /projects/:projectId/report/log-summary`

Retorna o resumo pronto para futuros leitores automatizados de log.

### Resumo inteligente e narracao

`GET /projects/:projectId/summary`

Retorna o resumo textual atual do projeto, ja estruturado para leitura humana, narrador e painel visual.

`POST /projects/:projectId/summary/refresh`

Recalcula o resumo sob demanda e retorna o mesmo formato de payload.

`POST /projects/:projectId/summary/audio`

Gera ou reaproveita a narracao em audio do resumo atual e retorna o payload atualizado do resumo.

`GET /projects/:projectId/summary/audio`

Entrega o audio WAV do resumo atual.

`PUT /projects/:projectId/summary/audio/status`

Permite ao frontend sincronizar o estado visual do player com o backend.

```json
{
  "status": "playing"
}
```

Estados aceitos:

- `idle`
- `generating`
- `ready`
- `playing`
- `paused`
- `failed`

O backend tambem aceita `stopped` como alias legado e converte para `ready`.

O payload do resumo segue esta ideia:

```json
{
  "projectId": "uuid",
  "personality": {
    "mode": "sarcastic",
    "intensity": "medium"
  },
  "summary": {
    "title": "Resumo do projeto Nexus-portatil",
    "text": "Resumo do projeto...",
    "lastUpdated": "2026-03-25T17:30:00.000Z",
    "sourceUpdatedAt": "2026-03-25T17:29:00.000Z",
    "sections": [
      {
        "title": "O que foi feito recentemente",
        "items": [
          "A tarefa \"Fechar backend multi-projetos do Nexus\" foi concluida."
        ]
      }
    ],
    "highlights": [
      "O projeto esta com 42% de progresso geral."
    ],
    "audioUrl": "/projects/uuid/summary/audio?v=hash",
    "status": "ready",
    "audio": {
      "status": "ready",
      "audioUrl": "/projects/uuid/summary/audio?v=hash",
      "contentType": "audio/wav",
      "generatedAt": "2026-03-25T17:31:00.000Z",
      "provider": "internal",
      "voiceId": "system-default"
    }
  },
  "narrator": {
    "lastUpdated": "2026-03-25T17:30:00.000Z",
    "messages": [
      {
        "text": "Voce mandou bem: o projeto ja ganhou tracao real.",
        "timestamp": "2026-03-25T17:30:00.000Z",
        "priority": "medium",
        "audioUrl": "/projects/uuid/summary/audio?v=hash"
      }
    ]
  }
}
```

O frontend deve tratar `personality.mode` e `personality.intensity` como sinais de apresentacao. O texto de `summary` e `narrator` ja vem pronto do backend e nao deve ser reescrito no cliente.

### Dashboard e comandos por projeto

`GET /projects/:projectId/dashboard`

Retorna apenas o bloco `dashboard` com:

- progresso geral
- progresso de tarefas
- progresso de milestones
- progresso de comandos
- nivel, XP e progresso de nivel
- estado do projeto, saude, foco atual
- contadores de agenda
- resumo de logs

`GET /projects/:projectId/commands`

Retorna os comandos recentes associados ao projeto.

### Diagnosticos e auditoria

`GET /diagnostics/audit`

Retorna o ultimo relatorio de auditoria automatica do Nexus.

`POST /diagnostics/audit/run`

Forca uma nova rodada de auditoria e devolve o relatorio atualizado.

### Monitor da sessao do Antigravity

`GET /ui/antigravity/session`

Retorna o snapshot mais recente que o Nexus conseguiu ler da UI visivel do Antigravity via CDP.

Campos importantes:

- `available`: se a pagina do Antigravity esta acessivel
- `lastCheckedAt`: ultimo ciclo de leitura
- `lastChangedAt`: ultima vez em que a tela visivel mudou de forma relevante
- `visible`: titulo, atividade visivel, rascunho do editor, artefatos vistos em tela e trecho do texto renderizado
- `jobs`: evidencia por job aguardando agente, com `status`, `score`, `matchedSignals`, `warnings` e `excerpt`

`GET /ui/antigravity/session/:jobId`

Retorna apenas a evidencia monitorada de um job especifico.

## Shape util do snapshot de projeto

O backend entrega um projeto com esta estrutura conceitual:

```json
{
  "project": {
    "id": "uuid",
    "name": "Nexus-portatil",
    "description": "Painel principal",
    "createdAt": "2026-03-25T00:00:00.000Z",
    "state": "active"
  },
  "settings": {
    "projectRoot": "C:\\Projetos\\Nexus-portatil",
    "colorToken": "#55c271",
    "icon": "saturn"
  },
  "dashboard": {
    "progress": {
      "overallPct": 42,
      "tasksPct": 50,
      "milestonesPct": 33,
      "commandsPct": 60
    },
    "gamification": {
      "level": 3,
      "experiencePoints": 610,
      "currentLevelFloor": 500,
      "nextLevelAt": 750,
      "levelProgressPct": 44
    },
    "status": {
      "projectState": "active",
      "health": "steady",
      "overdueTasks": 1,
      "pendingReviews": 0,
      "nextFocus": "Fechar integracao do dashboard"
    },
    "tasks": {
      "total": 6,
      "pending": 2,
      "inProgress": 1,
      "completed": 3,
      "overdue": 1
    },
    "milestones": {
      "total": 3,
      "pending": 1,
      "inProgress": 1,
      "completed": 1
    },
    "queue": {
      "total": 8,
      "pending": 1,
      "processing": 0,
      "awaitingExternal": 1,
      "completed": 5,
      "failed": 1
    },
    "agendaCounts": {
      "overdue": 1,
      "today": 2,
      "upcoming": 1,
      "withoutDueDate": 1,
      "completed": 3
    },
    "logs": {
      "total": 17,
      "agentSummary": {
        "codex": 6,
        "antigravity": 4,
        "system": 7
      },
      "latestEntries": [
        "codex: backend do painel estruturado",
        "antigravity: dashboard visual finalizado"
      ],
      "autoNarrative": "Atividade recente: ..."
    }
  },
  "tasks": [],
  "milestones": [],
  "agenda": {
    "overdue": [],
    "today": [],
    "upcoming": [],
    "withoutDueDate": [],
    "completed": []
  },
  "logs": [],
  "commands": [],
  "summary": {
    "title": "Resumo do projeto Nexus-portatil",
    "text": "Resumo do projeto...",
    "lastUpdated": "2026-03-25T17:30:00.000Z",
    "sourceUpdatedAt": "2026-03-25T17:29:00.000Z",
    "sections": [],
    "highlights": [],
    "audioUrl": "/projects/uuid/summary/audio?v=hash",
    "status": "ready",
    "audio": {
      "status": "ready",
      "audioUrl": "/projects/uuid/summary/audio?v=hash",
      "contentType": "audio/wav",
      "generatedAt": "2026-03-25T17:31:00.000Z",
      "provider": "internal",
      "voiceId": "system-default"
    }
  },
  "narrator": {
    "lastUpdated": "2026-03-25T17:30:00.000Z",
    "messages": []
  },
  "report": {
    "total": 17,
    "agentSummary": {
      "codex": 6,
      "antigravity": 4,
      "system": 7
    },
    "latestEntries": [],
    "autoNarrative": "Atividade recente: ..."
  }
}
```

## Expectativa do frontend

O painel deve permitir:

- trocar projeto ativo sem reload bruto
- atualizar dashboard quando o projeto muda
- exibir agenda, progresso e logs do projeto selecionado
- exibir o resumo do projeto em texto claro e com secoes legiveis
- exibir mensagens do narrador de forma clara e facil de entender
- permitir ouvir o resumo e refletir visualmente os estados do player
- lidar com troca de provider de voz sem depender de mudanca de layout
- deixar claro o que esta concluido, em risco e pendente
- mostrar atividade por IA de forma legivel
- mostrar o estado do monitor do Antigravity de forma util, sem vender isso como certeza absoluta
- mostrar a auditoria do Nexus como sinal de saude, sem misturar isso com progresso do projeto
- ser responsivo e visualmente rico, sem inventar contratos fora do que o backend expoe

## Restricoes

- nao mexer em backend, contratos ou persistencia sem necessidade real
- se houver necessidade de ajuste em contrato, documentar com clareza no log
- preservar a separacao: backend/logica com Codex, apresentacao/UI/UX com Antigravity
