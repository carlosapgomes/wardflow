# HANDOFF + PROMPT — S13A (Nome opcional na criação de visita + dedupe)

## Contexto atual
- S12C concluído: refactor tags-first finalizado.
- Problema de UX: criar duas visitas no mesmo dia pode gerar nomes iguais.
- Também falta permitir entrada simples de string na criação da visita.

## Objetivo do slice
Melhorar criação de visita com baixo risco:
1) permitir ao usuário informar nome/base opcional ao criar visita,
2) evitar colisão de nome no mesmo dia (dedupe automático).

## Escopo (micro)

### 1) UI de criação com nome opcional
Arquivo: `src/views/visits-view.ts`

Implementar:
- Ao clicar em "Nova visita", abrir modal simples com:
  - input texto opcional (ex.: "Plantão manhã", "Cirurgia")
  - botão Cancelar
  - botão Criar
- Se input vazio, usar fluxo padrão existente.
- Se preenchido, enviar string para o serviço de criação.

### 2) Dedupe de nome no serviço
Arquivo: `src/services/db/visits-service.ts`

Implementar no `createPrivateVisit(namePrefix?)`:
- gerar `baseName` como já faz hoje (`generatePrivateVisitName(namePrefix)`)
- listar visitas do usuário na mesma data
- se `baseName` já existir, usar sufixo incremental:
  - `"<baseName> (2)"`, `"<baseName> (3)"`, etc.
- persistir nome final único.

Regra de escopo do dedupe:
- apenas para o mesmo usuário e mesma data.

### 3) Testes de serviço
Arquivo: `src/services/db/visits-service.test.ts`

Adicionar/ajustar testes para:
- criar visita sem prefixo (mantém comportamento atual)
- criar visita com prefixo
- dedupe com colisão (`(2)`, `(3)`)

## Fora de escopo
- edição posterior do nome da visita
- refatorações amplas em views/services
- mudanças em duplicar visita (`duplicateVisitAsPrivate`) além do necessário

## Critérios de aceite
- usuário consegue informar string opcional na criação
- nomes não colidem no mesmo dia para o mesmo usuário
- validações verdes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S13A - Nome opcional na criação de visita + dedupe de nomes no mesmo dia** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice13a-visit-name-input-and-dedupe-handoff-prompt.md`
4) `src/views/visits-view.ts`
5) `src/services/db/visits-service.ts`
6) `src/services/db/visits-service.test.ts`
7) `src/models/visit.ts`

## Escopo
1. Em `visits-view.ts`, trocar ação direta do FAB por modal com input opcional de nome/base.
2. Em `createPrivateVisit(namePrefix?)` (`visits-service.ts`), garantir dedupe de nome no mesmo dia:
   - baseName já existente -> adicionar sufixo ` (2)`, ` (3)`...
3. Ajustar testes em `visits-service.test.ts` para cobrir prefixo e dedupe.

## Restrições
- NÃO fazer refatoração ampla.
- NÃO mudar fluxos fora de criação de visita.
- Diff pequeno e focado.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- arquivos alterados
- resumo curto
- resultado dos 3 comandos
```
