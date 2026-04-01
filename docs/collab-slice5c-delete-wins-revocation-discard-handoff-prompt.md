# HANDOFF + PROMPT — S5C (Conflitos offline: delete > update + descarte pós-revogação)

## Contexto atual
- S5A: rules colaborativas por visita já existem.
- S5B: push/pull por visita implementado (mirror + pull por memberships + dedupe).
- Sync ainda precisa endurecer dois comportamentos de domínio:
  1) **delete vence update** em operações offline concorrentes.
  2) se usuário perdeu acesso (permission denied), mudanças locais pendentes devem ser **descartadas**.

## Objetivo do slice
Ajustar o sync para obedecer regras de conflito sem refatoração ampla.

## Escopo (micro)

### 1) Delete vence update no processamento da fila
Em `src/services/sync/sync-service.ts`:
- adicionar helper puro exportado para decidir se item da fila deve ser ignorado por existir **delete posterior** do mesmo `entityId` (somente `entityType='note'`).
  - Exemplo de assinatura sugerida:
    - `shouldSkipNoteQueueItemDueToLaterDelete(item, allPending): boolean`
- em `syncNow()`, antes de processar cada item:
  - se helper retornar true -> remover esse item da fila e continuar

### 2) Descarte pós-revogação (permission denied)
Em `handleSyncError(...)`:
- detectar erro de permissão do Firestore (`permission-denied`)
- para `entityType='note'`:
  - descartar alteração local pendente:
    - remover nota local (`db.notes.delete(item.entityId)`)
    - remover item da fila (`db.syncQueue.delete(item.id)`)
  - registrar warning de observabilidade
  - **não** fazer retry para esse caso

### 3) Atualização de nota: evitar upsert em fallback (delete remoto não deve ressuscitar)
No fluxo de update de nota (`processNoteSyncItem`):
- remover fallback `setDoc(..., { merge: true })` após falha de `updateDoc`
- em caso de erro, deixar seguir para tratamento central em `handleSyncError`

> Meta: evitar “ressuscitar” nota apagada remotamente.

### 4) TDD seletivo
Em `src/services/sync/sync-service.test.ts`, adicionar testes para:
- helper `shouldSkipNoteQueueItemDueToLaterDelete` (cenários true/false)
- helper de detecção de erro de permissão (se criar helper puro)

## Fora de escopo
- UI/toast de aviso ao usuário.
- Realtime.
- Cloud Functions.
- Refatoração grande de arquitetura de sync.

## Critérios de aceite
- update/create pendente é ignorado quando houver delete posterior da mesma nota.
- permission-denied em nota pendente descarta fila + dado local pendente (sem retry).
- update não faz mais upsert fallback silencioso.
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S5C - delete > update + descarte pós-revogação** com escopo mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice5c-delete-wins-revocation-discard-handoff-prompt.md`
4) `src/services/sync/sync-service.ts`
5) `src/services/sync/sync-service.test.ts`

## Escopo
1. Em `sync-service.ts`, criar helper puro exportado para identificar item de nota que deve ser pulado por haver `delete` posterior na fila da mesma entidade.
2. Aplicar esse helper no loop de `syncNow()` antes de `processSyncItem`.
3. Em `processNoteSyncItem` (operation update), remover fallback de `setDoc merge` após erro de `updateDoc`.
4. Em `handleSyncError`, tratar `permission-denied` para `entityType='note'` descartando nota local + item da fila sem retry.
5. Adicionar testes em `sync-service.test.ts` para os helpers puros criados.

## Restrições
- NÃO alterar UI.
- NÃO implementar realtime/functions.
- NÃO fazer refatoração ampla.
- Diff pequeno e focado.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- Arquivos alterados
- Resumo curto das regras aplicadas
- Resultado dos 3 comandos
```
