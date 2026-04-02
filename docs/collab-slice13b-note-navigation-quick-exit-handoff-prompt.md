# HANDOFF + PROMPT — S13B (Navegação rápida na tela de nota)

## Contexto atual
- S13A concluído (nome opcional + dedupe na criação de visita).
- Feedback de UX: durante criação/edição de nota, falta forma simples de voltar para "Minhas visitas".
- Hoje o header já tem menu de usuário, mas sem atalho direto para dashboard.

## Objetivo do slice
Melhorar navegação de saída rápida na tela de nota com impacto mínimo:
1) adicionar atalho "Minhas visitas" no menu do `app-header`,
2) adicionar botão de voltar no header da `new-note-view` para retornar à visita atual.

## Escopo (micro)

### 1) Atalho global no menu do header
Arquivo: `src/components/layout/app-header.ts`

Implementar:
- adicionar item de menu "Minhas visitas"
- ao clicar, fechar menu e navegar para `/dashboard`
- manter itens existentes (Configurações, Sobre, Instalar, Sair)

### 2) Botão voltar no header da nota
Arquivo: `src/views/new-note-view.ts`

Implementar:
- usar `?showBack=${true}` no `<app-header>` nos estados principais da view
- tratar `@back-click` para:
  - se `visitId` existir -> `/visita/{visitId}`
  - fallback -> `/dashboard`

> Não incluir confirmação de descarte neste slice (fica para possível slice futuro).

## Fora de escopo
- modal de confirmação para alterações não salvas
- mudanças de fluxo de salvar/cancelar
- refatoração ampla

## Critérios de aceite
- da tela de nota, usuário consegue voltar para visita via botão de voltar do header
- de qualquer tela com menu de usuário, existe atalho "Minhas visitas"
- validações verdes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S13B - Navegação rápida na tela de nota** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice13b-note-navigation-quick-exit-handoff-prompt.md`
4) `src/components/layout/app-header.ts`
5) `src/views/new-note-view.ts`

## Escopo
1. Em `app-header.ts`:
   - adicionar item "Minhas visitas" no menu de usuário
   - clicar deve fechar menu e navegar para `/dashboard`
2. Em `new-note-view.ts`:
   - habilitar `showBack` no `<app-header>`
   - mapear `@back-click` para voltar à visita atual (`/visita/{visitId}`), com fallback `/dashboard`

## Restrições
- NÃO implementar confirmação de descarte neste slice.
- NÃO refatorar amplo.
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
