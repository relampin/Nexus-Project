# Nexus Canonical

## O que o Nexus e

Nexus Portatil e a camada de orquestracao local entre:

- usuario
- Codex
- Antigravity
- projeto alvo

Ele existe para transformar trabalho solto de agentes em um fluxo operacional com contexto por projeto, fila, logs, validacao e observabilidade.

## Modelo canonico

### 1. Projeto ativo

O Nexus sempre opera com um projeto ativo global.

Cada projeto possui isolamento proprio para:

- tarefas
- progresso
- milestones
- logs
- comandos
- resumo
- metricas
- configuracao

### 2. Codex

Codex e responsavel por:

- backend
- logica
- contratos
- dados
- estabilidade
- validacao
- integracoes
- estruturacao do handoff

### 3. Antigravity

Antigravity e responsavel por:

- frontend
- layout
- UX
- navegacao
- acabamento visual

Ele nao deve alterar backend, persistencia ou contratos sem necessidade real e explicita.

### 4. Handoff

Quando um job vai para o Antigravity, o Nexus:

- cria um job local
- gera `bridge/antigravity/jobs/<job-id>/request.md`
- define log final em `log/<job-id>-antigravity.md`
- tenta entregar o prompt via CDP
- monitora escopo, sessao visivel e log final

### 5. Fechamento do job

Um job do Antigravity so e considerado pronto quando:

- o log final existe
- o log tem as secoes obrigatorias
- os arquivos alterados respeitam o escopo
- a revisao automatica nao encontra violacao

## Transporte oficial

O transporte oficial para o Antigravity e:

- `CDP`, quando disponivel
- `manual assistido`, quando o CDP nao estiver disponivel

Telegram nao faz parte do fluxo oficial.

## Responsabilidades do painel

O painel do Nexus deve servir como hub operacional. Ele precisa mostrar:

- agenda operacional
- task board
- radar do projeto
- timeline
- logs por IA
- comandos recentes
- estado de validacao
- digest diario
- leitura do workspace

## Regra de ouro

O backend e a fonte de verdade.

O frontend do Nexus e o frontend do projeto consomem estado. Eles nao devem inventar contrato, resumo, timeline, radar ou decisao operacional que o backend ja calculou.
