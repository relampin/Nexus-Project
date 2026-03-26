# Nexus Frontend Evolution Plan

## Objetivo

Evoluir o frontend do Nexus sem abrir uma refatoracao larga e descontrolada.

O foco e melhorar sustentabilidade, leitura e manutencao do painel mantendo:

- backend intacto
- contratos JSON intactos
- integracao Codex + Antigravity intacta
- comportamento do painel preservado durante a migracao

## Principio de execucao

As mudancas de frontend devem acontecer por etapas pequenas, reversiveis e validadas.

Nao vale:

- refatorar tudo de uma vez
- mudar contrato de API por conveniencia do frontend
- introduzir framework grande
- tocar backend, dados ou persistencia sem necessidade real

## Ordem recomendada

### Etapa 1. Modularizacao do frontend atual

Objetivo:

- tirar logica do `frontend/index.html`
- separar a casca em modulos pequenos de JS e CSS
- manter o comportamento atual do painel

Escopo:

- mover funcoes de render, helpers e wiring de eventos para modulos em `frontend/`
- extrair CSS reaproveitavel para arquivo dedicado
- manter `index.html` como entrypoint fino

Nao fazer nesta etapa:

- trocar contrato do backend
- redesenhar o produto inteiro
- mexer em persistencia ou runtime

### Etapa 2. Extracao de estilos inline

Objetivo:

- reduzir estilos escritos dentro do JS
- transformar blocos repetidos em classes CSS nomeadas

Escopo:

- timeline
- agenda
- cards de logs
- blocos de digest
- cards de workspace

### Etapa 3. Melhor foco operacional no modo completo

Objetivo:

- adicionar filtros rapidos e controles de leitura para reduzir tempo de escrutinio

Escopo:

- filtros por erro, warning, sucesso e agente
- recortes visuais por tipo de item
- leitura mais rapida do radar e dos logs

### Etapa 4. Performance de render

Objetivo:

- reduzir custo de rerender em listas longas

Escopo:

- timeline
- logs
- comandos recentes

Observacao:

Esta etapa so deve comecar depois da modularizacao e da extracao de estilos.

### Etapa 5. Audio e alertas inteligentes

Objetivo:

- evoluir o narrador para acionar voz em eventos realmente importantes

Escopo:

- alertas por falha critica
- alertas por validacao quebrada
- leitura contextual sem ruido excessivo

## Divisao entre agentes

### Codex

- protege contratos e backend
- revisa escopo e integracao
- valida regressao funcional
- define os limites de cada etapa

### Antigravity

- executa a modularizacao do frontend
- reorganiza estilos e estrutura visual
- melhora UX mantendo compatibilidade com a API atual

## Regra de ouro

Se a mudanca for grande demais para ser revisada com seguranca em uma rodada, ela precisa ser quebrada em mais etapas.

O objetivo nao e "refatorar bonito". O objetivo e deixar o Nexus mais facil de evoluir sem perder estabilidade.
