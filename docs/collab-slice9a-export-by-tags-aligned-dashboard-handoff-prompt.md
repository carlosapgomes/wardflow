# HANDOFF + PROMPT — S9A (Exportação alinhada ao dashboard por tags)

## Contexto atual
- S8A/S8B concluídos: dashboard agrupa por **tags** nativamente.
- Exportação (`message-export`) ainda está modelada em termos de `ward/wards`.
- `dashboard-view` hoje faz mapeamento temporário `tag -> ward` apenas para chamar export.

## Objetivo do slice
Alinhar o contrato de exportação ao critério atual do dashboard (tags), removendo adaptação temporária no view.

## Escopo (micro)

### 1) Tornar export service nativo para tags
Em `src/services/export/message-export.ts`:
- introduzir tipos nativos:
  - `TagGroupData { tag: string; notes: Note[] }`
  - `DateScope { type: 'date'; date: string; tags: TagGroupData[] }`
  - `TagScope { type: 'tag'; tag: string; notes: Note[] }`
  - `ExportScope = DateScope | TagScope`
- adaptar `generateMessage`:
  - escopo `date` itera `tags`
  - escopo `tag` usa `tag`
- manter **texto de saída** compatível (ex.: `*Pendências*`, lista de notas), mudando apenas rótulo da seção para tag.

> Opcional de robustez: manter alias/back-compat para `ward/wards` durante transição interna, se ficar simples.

### 2) Atualizar dashboard para remover shim de export
Em `src/views/dashboard-view.ts`:
- em `buildExportScope`, parar de mapear `tag -> ward`.
- retornar escopos de export já no formato nativo por tag.

### 3) Atualizar testes de export
Em `src/services/export/message-export.test.ts`:
- ajustar fixtures e asserts para escopo `tag/tags`.
- manter cobertura equivalente dos cenários já existentes (single group, múltiplos grupos, referência, etc.).

## Fora de escopo
- Mudar formatação visual das mensagens além do necessário.
- Alterar agrupamento/dashboard (já feito).
- Refatoração ampla de exportNotesAsText/Markdown além do necessário para manter consistência.

## Critérios de aceite
- Export usa contrato por tags, sem mapeamento artificial no dashboard.
- Mensagens continuam corretas para copy/share/preview.
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S9A - Exportação alinhada ao dashboard por tags** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice9a-export-by-tags-aligned-dashboard-handoff-prompt.md`
4) `src/services/export/message-export.ts`
5) `src/services/export/message-export.test.ts`
6) `src/views/dashboard-view.ts`

## Escopo
1. Em `message-export.ts`, tornar o contrato nativo por tags:
   - `TagGroupData`, `TagScope`, `DateScope.tags`, `ExportScope`
   - `generateMessage` para date/tag usando tags
2. Em `dashboard-view.ts`, remover mapeamento temporário tag->ward no `buildExportScope` e retornar escopo nativo.
3. Em `message-export.test.ts`, atualizar testes para novos tipos/escopos mantendo cobertura funcional.

## Restrições
- NÃO mudar agrupamento do dashboard.
- NÃO fazer refatoração ampla.
- Manter comportamento de copy/share/preview.

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
