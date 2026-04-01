# HANDOFF + PROMPT — S7B (UI múltiplas tags + remover-tag-ou-nota)

## Contexto atual
- S7A concluído: base de tags canônicas (`normalizeTagValue`, `normalizeTagList`) + `tags[]` no modelo + fallback de sync.
- Fluxo atual de edição/criação de nota ainda é centrado em `ward`, sem UI explícita de tags.
- Regra de produto congelada:
  - máximo 10 tags por nota;
  - remover tag desvincula;
  - se remover a última tag, remove a nota.

## Objetivo do slice
Adicionar UI mínima de múltiplas tags na tela de nota (create/edit) e aplicar regra **remove-tag-ou-nota** sem mexer no agrupamento do dashboard (isso fica para S8).

## Escopo (micro)

### 1) Notes service: suporte explícito a tags no save/update
Em `src/services/db/notes-service.ts`:
- `CreateNoteInput` passa a aceitar `tags?: string[]`.
- `saveNote`:
  - normalizar `input.tags` com `normalizeTagList`
  - se vazio/ausente, manter fallback atual `deriveTagsFromWard(input.ward)`
- `updateNote`:
  - aceitar `tags` em `updates`
  - quando `updates.tags` vier, normalizar antes de persistir

### 2) Notes service: regra remover última tag => excluir nota
Adicionar função exportada (nome sugerido):
- `removeTagFromNote(noteId: string, tagToRemove: string): Promise<'updated' | 'deleted'>`

Comportamento:
1. valida auth + ownership
2. remove tag por equivalência canônica
3. se sobrar >=1 tag:
   - atualiza nota com `tags` restantes
   - `syncStatus = 'pending'`, `updatedAt`
   - enfileira `update`
   - retorna `'updated'`
4. se não sobrar tags:
   - remove nota local
   - enfileira `delete`
   - retorna `'deleted'`

### 3) UI de tags em `new-note-view`
Em `src/views/new-note-view.ts`:
- adicionar campo de entrada de tags (ex.: texto separado por vírgula) + preview em chips.
- no load de nota em modo edição, preencher tags atuais.
- no salvar:
  - enviar tags normalizadas para `saveNote`/`updateNote`.
- ação de remover chip:
  - em modo criação: remove do draft local;
  - em modo edição: usar `removeTagFromNote`;
    - se retorno `'deleted'`, navegar de volta para `/visita/:visitId`.

> manter `ward` obrigatório e funcionando como hoje (compatibilidade).

### 4) Testes (TDD seletivo)
Adicionar testes em `src/services/db/notes-service.test.ts` para helpers puros/exportados criados neste slice (ou testes com mocks mínimos para `removeTagFromNote`), cobrindo:
- remoção de tag com atualização da nota;
- remoção da última tag resultando em exclusão.

## Fora de escopo
- Agrupamento dashboard por tags (S8A/S8B).
- Export por tags (S9A).
- Refatoração visual ampla.
- Alteração de regras remotas complexas.

## Critérios de aceite
- Tela de nota permite editar múltiplas tags.
- Remover tag funciona em edição.
- Última tag removida exclui nota (sem deixar nota órfã).
- Fluxo legado por `ward` continua funcionando.
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S7B - UI múltiplas tags + remover-tag-ou-nota** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice7b-tags-ui-remove-tag-or-note-handoff-prompt.md`
4) `src/views/new-note-view.ts`
5) `src/services/db/notes-service.ts`
6) `src/models/tag.ts`

## Escopo
1. `notes-service.ts`:
   - `CreateNoteInput` com `tags?: string[]`
   - `saveNote` usa tags normalizadas (fallback ward quando vazio)
   - `updateNote` aceita/normaliza tags
   - criar `removeTagFromNote(noteId, tagToRemove)` com retorno `'updated' | 'deleted'`
2. `new-note-view.ts`:
   - adicionar UI mínima para múltiplas tags (input + chips)
   - salvar tags no create/update
   - remover chip em edição usando `removeTagFromNote`
   - se remover última tag, navegar para `/visita/:visitId`
3. testes:
   - adicionar testes focados da regra remove-tag-ou-nota

## Restrições
- NÃO alterar agrupamento/dashboard/export.
- NÃO fazer refatoração ampla.
- Manter compatibilidade com `ward`.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- Arquivos alterados
- Resumo curto da lógica implementada
- Resultado dos 3 comandos
```
