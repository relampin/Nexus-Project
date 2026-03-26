# Nexus Portatil

Nexus Portatil e uma plataforma local para orquestrar `Codex` e `Antigravity` em qualquer projeto. Ele fornece painel web, fila persistente, agenda operacional, logs por agente, resumos inteligentes, validacao automatica e uma ponte de handoff para o Antigravity por CDP ou modo assistido manual.

## Visao geral

Hoje o fluxo oficial do Nexus e este:

1. o usuario trabalha no painel do Nexus
2. o Nexus cria jobs por projeto
3. jobs de `codex` podem ser executados automaticamente
4. jobs de `antigravity` geram handoff, tentam entrega via CDP e ficam em modo assistido se o CDP nao estiver disponivel
5. o Nexus acompanha fila, logs, timeline, revisao e validacao

Telegram nao faz mais parte do fluxo oficial.

## O que o Nexus faz

- gerencia multiplos projetos e um projeto ativo global
- indexa workspace e resume o que entendeu do projeto
- organiza agenda, task board, radar, timeline e logs
- dispara jobs para `codex` e `antigravity`
- gera handoff tecnico estruturado para o Antigravity
- monitora a sessao visivel do Antigravity via CDP
- fecha jobs por log, review e validacao automatica
- expõe um painel em tempo real com WebSocket e fallback local

## Requisitos

- Node.js
- Antigravity instalado e aberto quando houver jobs de frontend
- CDP do Antigravity exposto em `127.0.0.1:9222` para entrega automatica

## Setup rapido

1. copie a pasta do Nexus para a maquina nova
2. rode `npm install`
3. copie `.env.example` para `.env` se quiser customizar
4. ajuste `TARGET_PROJECT_ROOT` se o projeto alvo estiver fora da pasta do Nexus
5. rode `npm run build`
6. rode `npm start`
7. abra `http://localhost:3000/app`

## Setup do Antigravity

Para o Nexus entregar handoffs automaticamente, o Antigravity precisa abrir com CDP habilitado. O alvo padrao do Nexus e:

- `http://127.0.0.1:9222`

Se o CDP nao estiver disponivel, o Nexus continua funcionando, mas os jobs do Antigravity ficam em modo assistido manual ate o agente receber o request.

## Endpoints principais

- `GET /health`
- `GET /ui/bootstrap`
- `GET /ui/events`
- `GET /projects`
- `GET /projects/profiles`
- `GET /projects/active`
- `PUT /projects/active`
- `POST /projects`
- `PATCH /projects/:projectId`
- `DELETE /projects/:projectId`
- `POST /projects/:projectId/rescan`
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
- `GET /projects/:projectId/files`
- `GET /projects/:projectId/files/content?path=...`
- `GET /projects/:projectId/summary`
- `POST /projects/:projectId/summary/refresh`
- `POST /projects/:projectId/summary/audio`
- `PUT /projects/:projectId/summary/audio/status`
- `GET /projects/:projectId/summary/audio`
- `GET /commands`
- `GET /commands/:id`
- `POST /ui/dispatch`
- `GET /diagnostics/audit`
- `POST /diagnostics/audit/run`
- `POST /worker/process`

## Realtime

- `ws://localhost:3000/ui/ws`
- fallback: `GET /ui/events`

## Estrutura importante

- `src/`: backend, runtime, adapters, services e rotas
- `frontend/`: painel web do Nexus
- `docs/`: documentacao canonica do projeto
- `scripts/`: utilitarios locais
- `data/`: estado local do Nexus
- `bridge/`: handoffs gerados para agentes externos
- `log/`: logs do Antigravity por job

## Documentacao canonica

- [Arquitetura Canonica](C:\Projetos Antigravity\teste integração\Nexus-portatil\docs\NEXUS-CANONICAL.md)
- [Setup em Outra Maquina](C:\Projetos Antigravity\teste integração\Nexus-portatil\docs\SETUP-OUTRA-MAQUINA.md)
- [Prompt Base do Codex](C:\Projetos Antigravity\teste integração\Nexus-portatil\docs\prompts\CODEX-BOOTSTRAP.md)
- [Prompt Base do Antigravity](C:\Projetos Antigravity\teste integração\Nexus-portatil\docs\prompts\ANTIGRAVITY-BOOTSTRAP.md)
- [Contrato do Dashboard](C:\Projetos Antigravity\teste integração\Nexus-portatil\docs\nexus-multiproject-dashboard-contract.md)

## Audio e TTS

- `TTS_PROVIDER=internal` usa a voz local
- `TTS_PROVIDER=elevenlabs` usa ElevenLabs se a chave e a voz estiverem configuradas
- o frontend nao precisa mudar quando o provider muda

## Observacao

O Nexus ja funciona como plataforma de integracao entre Codex e Antigravity. O ponto critico para automacao completa e a disponibilidade do CDP do Antigravity. Sem ele, o fluxo continua, mas entra em assistencia manual.
