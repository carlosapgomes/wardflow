# HANDOFF + PROMPT — S5D (Realtime apenas da visita aberta)

## Contexto atual
- S5A e S5B/S5C concluídos.
- Sync já faz push/pull incremental por visita, mas ainda por polling/sync periódico.
- Regra de produto deste slice: **realtime apenas da visita que o usuário está visualizando**.

## Objetivo do slice
Adicionar listener realtime Firestore para notas da visita ativa, com lifecycle simples e seguro:
- ativa ao entrar em rota de visita (`/visita/:visitId`, `/visita/:visitId/nova-nota`, `/visita/:visitId/editar-nota/:id`)
- desativa ao sair dessas rotas / logout / cleanup

## Escopo (micro)

### 1) Sync service: listener da visita ativa
Em `src/services/sync/sync-service.ts`:
- adicionar estado interno para listener ativo (`unsubscribe` + `activeVisitId`)
- exportar função:
  - `setActiveVisitRealtime(visitId: string | null): void`
- comportamento:
  - se `visitId` igual ao atual -> no-op
  - ao trocar visita, encerra listener anterior
  - se `visitId` null -> encerra e sai
  - se sem auth / sem firestore / offline -> não inicia
  - iniciar `onSnapshot` em `/visits/{visitId}/notes`

No callback do snapshot:
- converter docs remotos para `Note` local (reaproveitar função existente)
- aplicar `resolveNoteConflict(local, remote)` antes de persistir
- `bulkPut` das notas recebidas
- reconciliar removidas para aquela visita:
  - remover localmente apenas notas `syncStatus='synced'` daquela `visitId` que sumiram do snapshot

### 2) App: conectar rota -> visita ativa
Em `src/app.ts`:
- importar `setActiveVisitRealtime`
- em `handleRouteChange(match)`, definir visitId ativo:
  - se `match.params.visitId` existir -> usar esse ID
  - senão -> `null`
- chamar `setActiveVisitRealtime(...)`
- opcional defensivo: quando auth ficar deslogado, chamar `setActiveVisitRealtime(null)`

### 3) Cleanup
No `cleanupSync()` (ou no próprio `setActiveVisitRealtime`) garantir encerramento do listener realtime para evitar leak.

## Fora de escopo
- Realtime de members/invites.
- Realtime global em todas visitas.
- UI nova.
- Refatoração ampla do app/router.

## Critérios de aceite
- Listener realtime ativo só na visita aberta.
- Troca de visita troca listener corretamente.
- Sair de rota de visita desliga listener.
- Não sobrescrever local `pending/failed` (respeitar `resolveNoteConflict`).
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S5D - Realtime apenas da visita aberta** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice5d-active-visit-realtime-handoff-prompt.md`
4) `src/services/sync/sync-service.ts`
5) `src/app.ts`

## Escopo
1. Em `sync-service.ts`, adicionar lifecycle de listener realtime de notas da visita ativa:
   - export `setActiveVisitRealtime(visitId: string | null)`
   - onSnapshot em `/visits/{visitId}/notes`
   - troca/stop de listener ao mudar visitId
   - reconciliar upsert + deletadas (apenas synced)
   - usar `resolveNoteConflict` para preservar pending/failed local
2. Em `app.ts`, conectar rota ativa para atualizar `setActiveVisitRealtime`:
   - rotas com `params.visitId` ativam listener
   - demais rotas desativam
3. Garantir cleanup do listener em logout/cleanup.

## Restrições
- NÃO adicionar realtime para members/invites.
- NÃO alterar UI.
- NÃO fazer refatoração ampla.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- Arquivos alterados
- Resumo curto do lifecycle realtime
- Resultado dos 3 comandos
```
