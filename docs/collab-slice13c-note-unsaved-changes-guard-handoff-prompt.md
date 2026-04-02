# HANDOFF + PROMPT — S13C (Guard de alterações não salvas na nota)

## Contexto atual
- S13A: criação de visita com nome opcional + dedupe no mesmo dia.
- S13B: navegação rápida na nota (`showBack` no header e atalho "Minhas visitas" no menu).
- Gap de UX atual: com navegação mais rápida, ficou fácil sair da tela de nota e perder rascunho sem aviso.

## Objetivo do slice
Adicionar confirmação de descarte quando usuário tentar sair da tela de nota com alterações não salvas.

## Escopo (micro)

### 1) Guard de saída na `new-note-view`
Arquivo principal: `src/views/new-note-view.ts`

Implementar:
- detectar se o formulário está "sujo" (dirty) comparando estado atual vs estado inicial.
- interceptar ações de saída da tela:
  - botão voltar do header (`@back-click`)
  - botão `Cancelar`
- comportamento esperado:
  - **sem alterações não salvas**: navega imediatamente (comportamento atual)
  - **com alterações não salvas**: abre modal de confirmação

### 2) Modal de confirmação de descarte
Arquivo principal: `src/views/new-note-view.ts`

Implementar modal simples com:
- título: `Descartar alterações?`
- mensagem curta explicando que mudanças não salvas serão perdidas
- ações:
  - `Continuar editando` (fecha modal)
  - `Descartar e sair` (segue navegação pendente)

### 3) Regras de navegação
- destino de saída continua o mesmo:
  - com `visitId`: `/visita/{visitId}`
  - sem `visitId`: `/dashboard`
- não bloquear fluxo de `Salvar` e `Excluir`

## Fora de escopo
- warning de `beforeunload` (fechar aba/reload)
- autosave
- refatoração ampla da view
- mudanças no `app-header`

## Critérios de aceite
- em criação/edição, ao alterar qualquer campo e clicar voltar/cancelar, modal aparece
- escolhendo `Continuar editando`, permanece na tela com rascunho intacto
- escolhendo `Descartar e sair`, navega para destino correto
- sem alterações, voltar/cancelar navega sem modal
- validações verdes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S13C - Guard de alterações não salvas na tela de nota** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice13c-note-unsaved-changes-guard-handoff-prompt.md`
4) `src/views/new-note-view.ts`

## Escopo
1. Detectar rascunho alterado (dirty) na `new-note-view`.
2. Interceptar saída por:
   - `@back-click` do header
   - botão `Cancelar`
3. Se dirty, abrir modal de confirmação de descarte:
   - botão `Continuar editando`
   - botão `Descartar e sair`
4. Destino de saída:
   - com `visitId`: `/visita/{visitId}`
   - sem `visitId`: `/dashboard`
5. Se não dirty, manter navegação imediata.

## Restrições
- NÃO implementar `beforeunload` neste slice.
- NÃO alterar `app-header`.
- NÃO fazer refatoração ampla.
- manter diff pequeno e focado.

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
