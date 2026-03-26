# Nexus Multiproject Dashboard Contract

## Contexto

O frontend do Nexus consome um backend que ja entrega estado agregado por projeto. O painel nao deve recomputar radar, resumo, timeline ou agenda operacional. Esses blocos chegam prontos do backend.

## Endpoints centrais

### Bootstrap do painel

- `GET /ui/bootstrap`
- `GET /ui/bootstrap-kit`

Campos principais:

- `stats`
- `audit`
- `projects`
- `activeProject`
- `commands`
- `activity`
- `projectActivity`
- `antigravitySession`
- `manualAssist`

### Bootstrap kit

- `GET /ui/bootstrap-kit`

Entrega os textos canônicos que o proprio painel usa para copiar:

- documentacao canonica
- setup em outra maquina
- prompt base do Codex
- prompt base do Antigravity

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

### Operacao do projeto

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

## Shape do activeProject

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
    "progress": {},
    "status": {},
    "tasks": {},
    "milestones": {},
    "queue": {},
    "agendaCounts": {},
    "logs": {}
  },
  "agenda": {},
  "agendaOperational": {
    "immediate": [],
    "thisWeek": [],
    "atRisk": [],
    "blocked": [],
    "nextUp": [],
    "recentlyCompleted": []
  },
  "radar": {
    "headline": "Radar estrategico",
    "risk": "Texto curto",
    "blocker": "Texto curto",
    "nextDelivery": "Texto curto",
    "checkpoints": [],
    "actions": []
  },
  "taskBoard": {
    "lanes": []
  },
  "timeline": [],
  "git": {
    "available": true,
    "branch": "main",
    "clean": false,
    "ahead": 0,
    "behind": 0,
    "summary": "Resumo Git",
    "changedFiles": [],
    "recentCommits": []
  },
  "validation": {
    "status": "idle",
    "lastRunAt": "2026-03-26T18:10:00.000Z",
    "summary": "Resumo da validacao",
    "steps": []
  },
  "digest": {
    "generatedAt": "2026-03-26T18:10:00.000Z",
    "title": "O que mudou hoje",
    "summary": "Resumo curto",
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

## Regras do frontend

- usar o backend como fonte de verdade
- nao recalcular radar, narrador, digest, timeline ou agenda operacional no cliente
- tratar blocos vazios sem quebrar a tela
- acionar `radar.actions` com `POST /projects/:projectId/radar/actions/:actionId`
- disparar validacao manual com `POST /projects/:projectId/validation/run`
- usar `GET /projects/:projectId/search?q=...` para busca
- mostrar `manualAssist` para jobs externos do Antigravity

## Observacoes

- a entrega para o Antigravity usa CDP quando disponivel
- sem CDP, o Nexus continua gerando handoff e entra em assistencia manual
- o frontend nao precisa conhecer detalhes internos de transporte
