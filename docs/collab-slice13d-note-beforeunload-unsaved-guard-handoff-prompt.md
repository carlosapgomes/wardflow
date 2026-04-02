# HANDOFF + PROMPT — S13D (Aviso `beforeunload` para rascunho de nota)

## Contexto atual
- S13B adicionou navegação rápida na `new-note-view` (back/cancel).
- S13C adicionou modal de confirmação de descarte para saída interna da tela quando há alterações não salvas.
- Gap restante: usuário ainda pode perder rascunho ao **recarregar página**, **fechar aba** ou **navegar fora pelo browser** sem aviso.

## Objetivo do slice
Adicionar proteção mínima com `beforeunload` na `new-note-view` para avisar quando houver alterações não salvas.

## Escopo (micro)

Arquivo principal: `src/views/new-note-view.ts`

Implementar:
1. Registrar listener de `beforeunload` quando a view montar.
2. Remover listener no `disconnectedCallback`.
3. No handler de `beforeunload`:
   - se formulário estiver dirty e não estiver salvando/excluindo, bloquear saída padrão:
     - `event.preventDefault()`
     - `event.returnValue = ''`
   - caso contrário, não bloquear.
4. Reaproveitar a lógica de dirty já existente no S13C (`checkDirty`).

## Fora de escopo
- alterar textos nativos do prompt de navegador (não suportado por browsers modernos)
- guardar rascunho automaticamente
- interceptar navegação de rotas além do que já existe no S13C
- mudanças em `app-header` ou router

## Critérios de aceite
- ao editar nota (dirty) e tentar recarregar/fechar aba, navegador exibe aviso nativo de saída
- sem alterações, recarregar/fechar aba não mostra aviso
- durante salvar/excluir, não deve bloquear indevidamente
- validações verdes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S13D - Aviso beforeunload para rascunho não salvo na nota** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice13d-note-beforeunload-unsaved-guard-handoff-prompt.md`
4) `src/views/new-note-view.ts`

## Escopo
1. Na `new-note-view.ts`, adicionar listener de `beforeunload` ao montar a view.
2. Remover listener no `disconnectedCallback`.
3. No handler, usar lógica dirty existente (S13C):
   - se dirty e não estiver `saving`/`deleting`, executar `event.preventDefault()` e `event.returnValue = ''`
   - caso contrário, não bloquear

## Restrições
- NÃO alterar `app-header`.
- NÃO refatorar amplo.
- NÃO tentar customizar texto de confirmação do browser.
- diff pequeno e focado.

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
