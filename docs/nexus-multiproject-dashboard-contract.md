# Nexus Multiproject Dashboard Contract

## Contexto

O Nexus agora funciona como hub multi-projetos. O frontend deve tratar projeto ativo, agenda operacional, radar acionável, timeline, Git, validação, busca, logs, resumo inteligente e comandos como partes da mesma experiência.

O backend continua sendo a fonte de verdade para:

- projetos e projeto ativo global
- tarefas, marcos e agenda operacional
- fila, comandos e relação tarefa -> job -> resultado
- logs estruturados por projeto
- resumo inteligente, narrador e áudio
- timeline consolidada
- Git, validação automática e digest diário

## Endpoints principais

### Bootstrap do painel

`GET /ui/bootstrap`

Entrega o estado inicial do painel.

Campos centrais:

- `stats`
- `audit`
- `projects`
- `activeProject`
- `commands`
- `activity`
- `projectActivity`
- `antigravitySession`
- `manualAssist`

### Projetos

- `GET /projects`
- `GET /projects/profiles`
- `POST /projects`
- `GET /projects/active`
- `PUT /projects/active`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `DELETE /projects/:projectId`
- `POST /projects/:projectId/rescan`

### Operação do projeto

- `GET /projects/:projectId/tasks`
- `POST /projects/:projectId/tasks/:taskId/send-to-agent`
- `GET /projects/:projectId/radar`
- `POST /projects/:projectId/radar/actions/:actionId`
- `GET /projects/:projectId/timeline`
- `GET /projects/:projectId/git`
- `GET /projects/:projectId/validation`
- `POST /projects/:projectId/validation/run`
- `GET /projects/:projectId/digest/daily`
- `GET /projects/:projectId/search?q=texto`

### Logs, arquivos e resumo

- `GET /projects/:projectId/logs`
- `GET /projects/:projectId/report/log-summary`
- `GET /projects/:projectId/files`
- `GET /projects/:projectId/files/content?path=...`
- `GET /projects/:projectId/summary`
- `POST /projects/:projectId/summary/refresh`
- `POST /projects/:projectId/summary/audio`
- `PUT /projects/:projectId/summary/audio/status`
- `GET /projects/:projectId/summary/audio`

## Shape do projeto ativo

`activeProject` segue esta estrutura conceitual:

```json
{
  "project": {
    "id": "uuid",
    "name": "Nexus-portatil",
    "description": "Painel principal do Nexus",
    "createdAt": "2026-03-26T00:00:00.000Z",
    "state": "active"
  },
  "settings": {
    "projectRoot": "C:\\Projetos\\Nexus-portatil",
    "profileId": "ai_hub",
    "stackHint": "Node.js, TypeScript, Express, Frontend, Backend"
  },
  "personality": {
    "mode": "sarcastic",
    "intensity": "medium"
  },
  "profile": {
    "id": "ai_hub",
    "label": "Hub de IA",
    "description": "Sistema de orquestracao entre agentes, observabilidade e execucao multiagente.",
    "focusAreas": ["agentes", "monitoramento", "fluxo operacional"]
  },
  "dashboard": {
    "progress": {
      "overallPct": 42,
      "tasksPct": 50,
      "milestonesPct": 33,
      "commandsPct": 60
    },
    "status": {
      "projectState": "active",
      "health": "steady",
      "overdueTasks": 1,
      "pendingReviews": 0,
      "nextFocus": "Fechar integracao do painel"
    },
    "tasks": {},
    "milestones": {},
    "queue": {},
    "agendaCounts": {},
    "logs": {}
  },
  "agenda": {
    "overdue": [],
    "today": [],
    "upcoming": [],
    "withoutDueDate": [],
    "completed": []
  },
  "agendaOperational": {
    "immediate": [],
    "thisWeek": [],
    "atRisk": [],
    "blocked": [],
    "nextUp": [],
    "recentlyCompleted": []
  },
  "radar": {
    "headline": "Radar estrategico de Nexus-portatil",
    "risk": "Existe 1 falha recente...",
    "blocker": "Ainda ha trabalho aguardando outro agente.",
    "nextDelivery": "Fechar timeline do projeto",
    "checkpoints": [],
    "actions": [
      {
        "id": "attack_next_delivery",
        "label": "Atacar proxima entrega",
        "description": "Abre um job para mover a entrega mais util do momento.",
        "target": "codex",
        "variant": "primary",
        "commandText": "..."
      }
    ]
  },
  "taskBoard": {
    "lanes": [
      {
        "id": "immediate",
        "label": "Fazer agora",
        "count": 2,
        "items": [
          {
            "taskId": "uuid",
            "title": "Fechar timeline",
            "priority": "high",
            "status": "in_progress",
            "linkedCommandId": "uuid",
            "linkedCommandStatus": "processing",
            "linkedCommandTarget": "codex",
            "linkedResultSummary": "..."
          }
        ]
      }
    ]
  },
  "timeline": [
    {
      "id": "command-uuid",
      "timestamp": "2026-03-26T18:00:00.000Z",
      "kind": "command",
      "title": "system -> codex (task)",
      "detail": "Job fechado...",
      "status": "success"
    }
  ],
  "git": {
    "available": true,
    "branch": "main",
    "clean": false,
    "ahead": 0,
    "behind": 0,
    "summary": "3 arquivo(s) com mudanca local na branch main.",
    "changedFiles": [],
    "recentCommits": []
  },
  "validation": {
    "status": "warning",
    "lastRunAt": "2026-03-26T18:10:00.000Z",
    "summary": "A validacao passou, mas 1 passo foi pulado por falta de script.",
    "steps": []
  },
  "digest": {
    "generatedAt": "2026-03-26T18:10:00.000Z",
    "title": "O que mudou hoje em Nexus-portatil",
    "summary": "Resumo curto do dia",
    "wins": [],
    "risks": [],
    "nextSteps": []
  },
  "tasks": [],
  "milestones": [],
  "logs": [],
  "commands": [],
  "files": {},
  "summary": {},
  "narrator": {},
  "report": {}
}
```

## Regras de frontend

- o cliente nao deve recalcular resumo, narrador, radar ou timeline; isso ja vem pronto do backend
- `radar.actions` deve ser acionado com `POST /projects/:projectId/radar/actions/:actionId`
- `validation` deve permitir refresh sob demanda via `POST /projects/:projectId/validation/run`
- `search` deve usar `GET /projects/:projectId/search?q=...`
- `taskBoard` e `agendaOperational` devem guiar a area principal da operacao
- a UI deve continuar robusta quando algum bloco vier vazio

## Observacoes

- o monitor do Antigravity continua disponivel por API, mas nao e obrigatorio na UX principal
- o backend aceita troca futura de TTS sem exigir mudanca no frontend
- o payload foi desenhado para funcionar com multiplos projetos e multiplos agentes
