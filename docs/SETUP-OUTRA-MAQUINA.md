# Setup em Outra Maquina

## Objetivo

Este guia existe para subir o Nexus em outra maquina sem depender da conversa original.

## Passo a passo

1. clone ou copie o repositorio
2. rode `npm install`
3. copie `.env.example` para `.env`
4. ajuste `TARGET_PROJECT_ROOT` se o projeto alvo estiver fora da pasta do Nexus
5. confirme que o Antigravity esta instalado
6. abra o Antigravity no projeto correto
7. exponha o CDP do Antigravity em `127.0.0.1:9222`
8. rode:
   - `npm run build`
   - `npm start`
9. abra `http://localhost:3000/app`

## O que precisa existir

- Node.js
- Nexus-Portatil
- Antigravity aberto
- CDP do Antigravity disponivel para entrega automatica

## Verificacoes rapidas

- `GET /health`
- `GET /ui/bootstrap`
- `ws://localhost:3000/ui/ws`
- `http://127.0.0.1:9222/json/list`

## Comportamento esperado

Se o CDP estiver ativo:

- jobs do Antigravity serao injetados automaticamente
- `external.channel` vira `cdp`
- `meta.delivery.mode` vira `cdp`
- o monitor do Antigravity tende a marcar o job como `matched`

Se o CDP nao estiver ativo:

- o Nexus ainda gera `request.md`
- o job fica em `awaiting_external`
- o painel mostra assistencia manual

## Arquivos que voce deve preservar

- `src/`
- `frontend/`
- `docs/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.env.example`
- `README.md`

## Arquivos de runtime que nao precisam ir para Git

- `data/`
- `bridge/`
- `log/`
- `logs/`
- `dist/`
- `node_modules/`
