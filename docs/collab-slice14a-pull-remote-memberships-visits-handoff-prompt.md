# HANDOFF + PROMPT — S14A (Pull remoto de memberships + visitas no login)

## Contexto do problema (validado em teste manual)
- Com o mesmo usuário em múltiplos dispositivos, lista de visitas/notas não se mantém consistente.
- Após logout/login, dados podem “sumir” localmente.

## Causa raiz (estado atual)
- O app limpa Dexie no logout (`clearLocalUserData`).
- No login, o sync atual puxa **notas** e **settings**, mas **não hidrata visitas/memberships**.
- Como `pullNotesFromVisits(...)` depende de `visitMembers` locais ativos, sem hidratação de memberships não há pull completo por visita.

## Objetivo do slice
Hidratar base local de colaboração no login, puxando do Firestore:
1. memberships ativos do usuário,
2. visitas correspondentes,
antes do pull de notas.

## Escopo (micro)

### 1) Sync Service — novo pull remoto para memberships/visitas
Arquivo: `src/services/sync/sync-service.ts`

Implementar função exportada (nome sugerido):
- `pullRemoteVisitMembershipsAndVisits(): Promise<void>`

Comportamento esperado:
- Se `auth.loading`, sem usuário, offline ou sem Firestore: return silencioso.
- Query em `collectionGroup('members')` filtrando `userId == currentUser.uid`.
- Filtrar apenas docs com `status === 'active'`.
- Upsert local de `visitMembers` (convertendo timestamps para Date).
- Para cada `visitId` ativo, buscar `doc('visits/{visitId}')` e upsert local em `db.visits`.
- Não deletar dados locais neste slice (apenas hidratar/upsert).
- Em caso de erro de uma visita específica, continuar best-effort.

### 2) Ordem de sync no app
Arquivo: `src/app.ts`

Ajustar `performSync()` para executar na ordem:
1. `syncNow()`
2. `pullRemoteVisitMembershipsAndVisits()`
3. `pullRemoteNotes()`
4. `pullRemoteSettings()`

Objetivo: garantir memberships/visitas locais antes do pull de notas por visita.

### 3) Testes
Arquivo: `src/services/sync/sync-service.test.ts`

Adicionar testes unitários mínimos para o novo pull:
- retorna sem erro quando usuário não autenticado
- hidrata membership ativo e visita correspondente
- ignora membership removido
- tolera erro de leitura de visita específica (best-effort)

## Fora de escopo
- Push de visitas ao criar/duplicar (fica para S14B)
- Guard de logout com pendências (fica para S14C)
- Refatoração ampla de sync
- Mudanças de schema/rules

## Critérios de aceite
- login em dispositivo “limpo” consegue reidratar visitas remotas existentes
- pull de notas por visita passa a ter memberships locais para funcionar
- validações verdes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S14A - Pull remoto de memberships + visitas no login** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice14a-pull-remote-memberships-visits-handoff-prompt.md`
4) `src/services/sync/sync-service.ts`
5) `src/app.ts`
6) `src/services/sync/sync-service.test.ts`

## Escopo obrigatório
1. Em `sync-service.ts`, criar `pullRemoteVisitMembershipsAndVisits()`:
   - pré-condições: auth ok + online + Firestore
   - query `collectionGroup('members')` com `where('userId','==',uid)`
   - filtrar `status === 'active'`
   - upsert local em `db.visitMembers`
   - buscar `/visits/{visitId}` e upsert em `db.visits`
   - best-effort: erro de uma visita não aborta todo pull
2. Em `app.ts`, ajustar ordem de `performSync()`:
   - `syncNow()`
   - `pullRemoteVisitMembershipsAndVisits()`
   - `pullRemoteNotes()`
   - `pullRemoteSettings()`
3. Em `sync-service.test.ts`, adicionar testes mínimos do novo pull.

## Restrições
- NÃO implementar push de visitas neste slice.
- NÃO alterar regras Firestore neste slice.
- NÃO refatorar amplo.
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
