# HANDOFF + PROMPT — S8B (Componente de grupo por tag + actions)

## Contexto atual
- S8A concluído: agrupamento do dashboard já é por tags (`groupNotesByDateAndTag`), mas com adaptação temporária para componentes legados (`ward-group`).
- Precisamos remover essa adaptação e introduzir componente próprio de tag.
- Objetivo deste slice: ajuste de componente/UI estrutural mínimo, sem mexer em export (S9A).

## Objetivo do slice
Criar componente de grupo por tag e conectar dashboard/date-group para usar a estrutura de tags de forma nativa.

## Escopo (micro)

### 1) Novo componente `tag-group`
Criar `src/components/groups/tag-group.ts` baseado no `ward-group`, mas semanticamente por tag:
- props:
  - `tag: string`
  - `notes: Note[]`
- evento de ações:
  - `tag-action` com detail `{ tag, notes, scopeType: 'tag' }`
- render:
  - título com `tag`
  - lista de `note-item`
  - botão de ações (⋯)

### 2) Atualizar `date-group` para tags
Em `src/components/groups/date-group.ts`:
- trocar `WardGroupData` por `TagGroupData` (ou equivalente)
  - estrutura: `{ tag: string; notes: Note[] }`
- propriedade `wards` -> `tags`
- `date-action` passa `tags` no detail
- render usa `<tag-group>`
- manter compatibilidade visual (sem redesign)

### 3) Atualizar `dashboard-view` para fluxo nativo por tag
Em `src/views/dashboard-view.ts`:
- remover adaptação temporária de `group.tags -> wards`
- usar estrutura de tags diretamente no `date-group`
- trocar handler `handleWardAction` para `handleTagAction`
- `SelectedScope` pode usar `{ type: 'tag'; tag: string; notes: Note[] }`
- manter integração com `generateMessage` sem quebrar:
  - em `buildExportScope`, mapear escopo de tag para `WardScope` existente (usar `ward: tag`) até S9A
  - para escopo de data, mapear `tags` para `wards` apenas na fronteira do export

## Fora de escopo
- Alterar serviço de export (`message-export`) para novos tipos (fica para S9A).
- Refatoração visual ampla.
- Testes de componente complexos.

## Critérios de aceite
- Dashboard renderiza grupos por tag sem adaptação intermediária para ward no `renderNotesList`.
- Ações por tag continuam funcionando (copy/share/preview/delete do escopo).
- Typecheck/lint/tests verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S8B - Componente de grupo por tag + actions** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice8b-tag-group-component-actions-handoff-prompt.md`
4) `src/views/dashboard-view.ts`
5) `src/components/groups/date-group.ts`
6) `src/components/groups/ward-group.ts`

## Escopo
1. Criar `src/components/groups/tag-group.ts` com `tag`, `notes`, evento `tag-action`.
2. Atualizar `date-group.ts` para usar `tags` e renderizar `tag-group`.
3. Atualizar `dashboard-view.ts` para consumir agrupamento por tags nativamente:
   - remover adaptação tags->wards no render
   - usar handler `tag-action`
   - ajustar `SelectedScope` para tag
   - manter compatibilidade com export atual mapeando tag -> ward em `buildExportScope`

## Restrições
- NÃO alterar export service ainda.
- NÃO fazer refatoração ampla.
- Manter visual e comportamento geral.

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
