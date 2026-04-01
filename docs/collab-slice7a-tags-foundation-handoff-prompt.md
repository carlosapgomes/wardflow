# HANDOFF + PROMPT — S7A (Base de tags: `ward` -> `tags[]`)

## Contexto atual
- S1–S6A concluídos (colaboração, ACL, sync, realtime da visita ativa, duplicação de visita).
- O domínio atual de nota usa `ward` como agrupador principal.
- Decisões de produto já congeladas para tags:
  - tags globais do usuário com equivalência canônica;
  - equivalência: trim + collapse spaces + uppercase + sem acento;
  - máximo de 10 tags por nota (UI fica para slice posterior).

## Objetivo do slice
Criar a **fundação técnica** de tags no modelo de nota, mantendo compatibilidade total com fluxo atual baseado em `ward`.

## Escopo (micro)

### 1) Helpers puros de normalização de tag
Criar `src/models/tag.ts` com funções puras exportadas:
- `normalizeTagValue(input: string): string`
  - trim
  - collapse de espaços internos
  - remove acentos
  - uppercase
- `normalizeTagList(tags: string[], max = 10): string[]`
  - aplica normalização por item
  - remove vazios
  - dedup por valor canônico
  - limita ao máximo (default 10)

Criar testes em `src/models/tag.test.ts` cobrindo:
- acentos / case / espaços
- deduplicação
- remoção de vazios
- limite máximo

### 2) Modelo de nota com base para tags
Em `src/models/note.ts`:
- adicionar campo `tags?: string[]` (compatível, sem quebrar fixtures atuais)
- em `createNote`, inicializar `tags` com `[]`

### 3) Persistência local: gerar tag inicial a partir de ward
Em `src/services/db/notes-service.ts`:
- no `saveNote`, preencher `tags` da nota nova com base em `ward`:
  - `tags = normalizeTagList([input.ward])`
- no `updateNote`, se `ward` for alterado, atualizar `tags` coerentemente a partir do novo `ward`

> Importante: manter `ward` funcionando como hoje (não remover nem trocar agrupamento ainda).

### 4) Sync pull: preservar tags quando vierem do remoto
Em `src/services/sync/sync-service.ts`:
- estender `FirestoreNoteData` para aceitar `tags?: unknown`
- em `convertFirestoreNoteToLocal`:
  - se `data.tags` for array de strings -> usar `normalizeTagList(data.tags)`
  - fallback para `normalizeTagList([data.ward ?? ''])` quando `tags` não existir/for inválido

## Fora de escopo
- UI de múltiplas tags.
- Agrupamento por tag no dashboard.
- Exportação por tags.
- Migração de dados legados complexa.

## Critérios de aceite
- Helpers puros de tag com testes passando.
- Novas notas já saem com `tags` derivadas de `ward`.
- Update de `ward` mantém `tags` coerentes.
- Pull remoto não perde tags quando já existirem.
- Compatibilidade mantida com fluxo atual (`ward` continua funcional).
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S7A - Base de tags (`ward` -> `tags[]`)** com diff mínimo e compatível.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice7a-tags-foundation-handoff-prompt.md`
4) `src/models/note.ts`
5) `src/services/db/notes-service.ts`
6) `src/services/sync/sync-service.ts`

## Escopo
1. Criar `src/models/tag.ts` com:
   - `normalizeTagValue(input: string): string`
   - `normalizeTagList(tags: string[], max = 10): string[]`
2. Criar `src/models/tag.test.ts` cobrindo normalização/dedupe/limite.
3. Em `note.ts`, adicionar `tags?: string[]` e default `tags: []` em `createNote`.
4. Em `notes-service.ts`, no `saveNote` e no `updateNote` (quando ward muda), derivar `tags` a partir de `ward` usando helper.
5. Em `sync-service.ts`, estender parser de nota remota para `tags`:
   - usar tags remotas quando válidas
   - fallback para tag única derivada de `ward`.

## Restrições
- NÃO mexer em UI.
- NÃO trocar agrupamento/export para tags ainda.
- NÃO fazer refatoração ampla.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- Arquivos alterados
- Resumo curto das mudanças
- Resultado dos 3 comandos
```
