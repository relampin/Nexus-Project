# Nexus Portatil

Painel e bridge local para orquestrar `Codex` e `Antigravity` em qualquer projeto, com dashboard web, fila persistente, agenda, logs por IA e monitoramento da sessao do Antigravity.

## O que ele faz

- recebe comandos por API
- guarda fila persistente
- despacha jobs para `codex` e `antigravity`
- acorda o Antigravity via CDP
- fecha jobs por log/resultado
- opcionalmente usa Telegram como transporte

## O que e obrigatorio

- Node.js
- Antigravity aberto no projeto alvo
- porta CDP do Antigravity exposta em `127.0.0.1:9222`

## O que e opcional

- Telegram
- OpenClaw

## Como usar

1. Copie esta pasta para qualquer maquina.
2. Rode `npm install`.
3. Se quiser, copie `.env.example` para `.env`.
4. Ajuste `TARGET_PROJECT_ROOT` apenas se quiser apontar para um projeto fora da pasta atual.
5. Abra Codex e Antigravity nesse projeto.
6. Confirme a porta do Antigravity:
   - `http://127.0.0.1:9222/json/version`
7. Rode o Nexus:
   - `npm run build`
   - `npm start`

## Estrutura que entra no repositório

O repositório precisa apenas do codigo-fonte e dos arquivos de bootstrap:

- `src/`
- `frontend/`
- `docs/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.env.example`
- `README.md`
- `Ligar_Nexus_Portatil.bat`

Pastas de runtime como `data/`, `bridge/`, `log/`, `logs/`, `dist/` e `node_modules/` nao precisam ser versionadas. O Nexus recria o que for necessario ao rodar.

## Sem .env

Se voce nao criar `.env`, o Nexus tenta descobrir sozinho o projeto alvo:

- se a propria pasta do Nexus parece um projeto, ele usa essa pasta
- se a pasta do Nexus tiver nome tipo `Nexus` e o diretorio pai parecer um projeto, ele usa o diretorio pai
- se nada disso bater, ele usa a propria pasta do Nexus

Na pratica:

- se voce colocar o `Nexus-portatil` dentro de um projeto, ele tende a funcionar sem configuracao extra
- se voce deixar o Nexus isolado fora do projeto, vale preencher `TARGET_PROJECT_ROOT`

## Endpoints

- `GET /health`
- `GET /ui/bootstrap`
- `GET /ui/antigravity/session`
- `GET /ui/events`
- `GET /projects`
- `GET /projects/active`
- `GET /projects/:projectId`
- `GET /projects/:projectId/tasks`
- `POST /projects/:projectId/tasks/:taskId/send-to-agent`
- `GET /store-api/health`
- `GET /store-api/categories`
- `GET /store-api/products`
- `GET /store-api/products/:id`
- `POST /store-api/orders`
- `GET /store-api/orders/:id`
- `GET /commands`
- `GET /commands/:id`
- `POST /commands`
- `GET /diagnostics/audit`
- `POST /diagnostics/audit/run`
- `POST /worker/process`
- `POST /telegram/relay`
- `GET /app`
- `GET /project-app`

## Realtime

- `ws://localhost:3000/ui/ws`
  canal bidirecional do painel para snapshots, observacao de projeto e refresh do monitor do Antigravity
- `GET /ui/events`
  fallback em SSE caso o websocket nao esteja disponivel

## Estrutura interna

- `data/`
  fila, auditoria, audio e estado do Nexus
- `logs/`
  logs do orquestrador
- `frontend/`
  painel visual do proprio Nexus
- `TARGET_PROJECT_ROOT/bridge/`
  jobs por agente
- `TARGET_PROJECT_ROOT/log/`
  logs operacionais do Antigravity

## Frontends

- `http://localhost:3000/app`
  painel do Nexus-portatil
- `http://localhost:3000/project-app`
  frontend do projeto alvo, se existir em `TARGET_PROJECT_ROOT/frontend`
- `http://localhost:3000/store-app`
  frontend da loja de racao, se existir em `TARGET_PROJECT_ROOT/frontend/store`

## Observacao

Se voce quer apenas o fluxo local Codex -> Nexus -> Antigravity, `Telegram` nao e necessario.
Ele so entra quando voce quiser transporte remoto ou notificacoes.

## Narrador e TTS

O resumo por projeto agora sai com texto, mensagens de narrador e bloco de audio.

- `TTS_PROVIDER=internal` usa o narrador local do Windows
- `TTS_PROVIDER=elevenlabs` tenta usar ElevenLabs quando `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` estiverem configurados
- se ElevenLabs nao estiver pronto, o Nexus cai para o provider interno sem exigir mudanca no frontend
