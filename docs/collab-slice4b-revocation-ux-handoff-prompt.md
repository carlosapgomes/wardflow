# HANDOFF + PROMPT — S4B (UX de revogação de acesso)

## Contexto atual (já pronto)
- S4A concluído: remoção owner-only no serviço local.
  - `removeVisitMemberAsOwner(...)` marca `status='removed'` + `removedAt`.
- Hoje, quando usuário removido tenta acessar a visita:
  - `dashboard-view` mostra "Acesso negado" genérico.
  - `new-note-view` mostra "Sem permissão para editar" (também genérico).
- Já existe status `access-revoked` no fluxo de aceite de convite (`invite-accept-view`).

## Objetivo do slice
Melhorar **UX de revogação** para deixar explícito quando o usuário foi removido da visita, com CTA claro para sair do fluxo da visita.

## Escopo (micro-slice)

### 1) Expor motivo de acesso (função pura)
Em `src/services/auth/visit-permissions.ts`, adicionar helper puro:
- tipo `VisitAccessState = 'active' | 'removed' | 'no-membership'`
- função `getVisitAccessState(member?: VisitMember | null): VisitAccessState`
  - sem member -> `no-membership`
  - member com `status='removed'` -> `removed`
  - member ativo -> `active`

Adicionar testes em `src/services/auth/visit-permissions.test.ts` cobrindo os 3 estados.

### 2) Dashboard: mensagem específica para removido
Em `src/views/dashboard-view.ts`:
- usar `getVisitAccessState(this.member)`
- quando estado for `removed`, renderizar card específico:
  - título: **"Acesso removido"**
  - mensagem: **"Seu acesso a esta visita foi removido."**
  - botão: **"Ir para minhas visitas"** → `navigate('/dashboard')`
- manter estado genérico de acesso negado para `no-membership`.

### 3) New Note: tratar removido sem confundir com viewer
Em `src/views/new-note-view.ts`:
- durante `checkPermissions()`, preservar o member completo (ou ao menos `accessState`) além de `canEdit`.
- se `accessState === 'removed'`, renderizar estado específico igual ao dashboard (mensagem de acesso removido + botão para `/dashboard`).
- manter estado atual "Sem permissão para editar" para viewer (`active` sem `canEdit`).

## Fora de escopo
- UI de gestão de membros (lista/remover via tela).
- Toast global cross-view.
- Sync/Firestore/realtime.
- Refatorações amplas de roteador/app.

## Critérios de aceite
- Usuário removido vê mensagem **explícita** de revogação (não genérica) nas views de visita.
- CTA leva para `/dashboard`.
- Viewer continua com mensagem de "sem permissão para editar" (não "acesso removido").
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S4B - UX de revogação de acesso** com escopo mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice4b-revocation-ux-handoff-prompt.md`

## Objetivo
Diferenciar UX de usuário removido da visita (`status='removed'`) vs usuário sem membership / viewer, com mensagem e CTA apropriados.

## Escopo
1. `src/services/auth/visit-permissions.ts`
   - adicionar tipo `VisitAccessState = 'active' | 'removed' | 'no-membership'`
   - adicionar `getVisitAccessState(member?: VisitMember | null): VisitAccessState`
2. `src/services/auth/visit-permissions.test.ts`
   - testes para `getVisitAccessState` nos 3 cenários
3. `src/views/dashboard-view.ts`
   - usar `getVisitAccessState(this.member)`
   - render específico para removido:
     - título "Acesso removido"
     - texto "Seu acesso a esta visita foi removido."
     - botão "Ir para minhas visitas" -> `/dashboard`
   - manter acesso negado genérico para `no-membership`
4. `src/views/new-note-view.ts`
   - preservar estado de acesso (não só boolean `canEdit`)
   - se removido, render específico de acesso removido + botão `/dashboard`
   - se viewer ativo, manter estado "Sem permissão para editar"

## Restrições
- Não alterar sync/firestore.
- Não criar arquitetura nova.
- Não refatorar rotas globais.
- Alterar o mínimo de arquivos possível.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- Lista de arquivos alterados
- Resumo objetivo do comportamento antes/depois
- Saída dos 3 comandos de validação
```
