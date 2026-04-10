# HANDOFF DE CONTEXTO (para reset) — WardFlow / VisitaMed

Data: 2026-04-05
Branch atual: `main`
Projeto Firebase: `visitamed-36570`
Hosting: `https://visitamed-36570.web.app`

---

## Resumo executivo

A base colaborativa principal está implementada e deployada, incluindo:
- sync multi-dispositivo,
- convites por link/token,
- roles `owner` / `editor` / `viewer`,
- exclusão de visita privada,
- exclusão de visita colaborativa pelo owner,
- leave visit remoto para `editor/viewer`,
- aceite de convite aguardando hidratação local antes de liberar navegação.

Além disso, o ciclo de **expiração de notas/visitas** foi implementado em 4 slices, seguido de uma correção estrutural importante:
1. moving window de expiração das notas + `visit.expiresAt`
2. expiração local imediata + UX local
3. cleanup global remoto via scheduler backend (15 min)
4. hardening de sync/convergência após cleanup backend
5. correção estrutural: o backend agora deriva `visit.expiresAt` remoto a partir das notas da visita

Além disso, a feature de **sugestões locais de tags por usuário** já está implementada em 3 slices:
1. fundação local com tabela materializada `userTagStats`
2. UI em `new-note-view` com top tags + filtro por prefixo
3. rebuild automático best-effort após eventos locais/remotos relevantes

Além disso, o sync passou por um hardening recente para evitar limpeza destrutiva local sob falha parcial de rede.

No momento, o projeto está em estado mais consistente para colaboração + lifecycle de visitas transitórias, com preenchimento de tags mais assistido, **com a refatoração do legado de notas concluída em código + limpeza remota executada no projeto Firebase**, e com a refatoração de naming de visitas em andamento (slices 1–3 concluídos localmente).

---

## Estado funcional atual do produto

### 1) Colaboração por visita
Estrutura remota em uso:
- `visits/{visitId}`
- `visits/{visitId}/members/{uid}`
- `visits/{visitId}/notes/{noteId}`
- `visits/{visitId}/invites/{inviteId}`

Fluxos já implementados:
- owner pode convidar `editor` e `viewer`
- `editor` pode criar/editar/excluir nota
- `viewer` só visualiza/exporta
- owner pode excluir visita colaborativa para todos
- `editor/viewer` saem da visita via endpoint remoto dedicado

### 2) Aceite de convite
Fluxo atual esperado:
- usuário abre `/convite/:token`
- faz login
- aceite remoto ocorre
- tela entra em **“Preparando sua visita”** com spinner
- roda hidratação explícita local
- só depois libera `Ver visita`
- fallback seguro evita navegação prematura e falso “sem autorização”

### 3) Expiração de notas
Regra atual:
- `Note.expiresAt` existe
- nota nasce com `createdAt + 14 dias`
- qualquer edição renova `expiresAt = now + 14 dias`
- remoção de tag, se a nota continuar existindo, também renova a expiração

### 4) Expiração de visitas
Regra atual:
- `Visit.expiresAt` existe
- visita nasce com `createdAt + 14 dias`
- criar/editar nota atualiza `visit.expiresAt` localmente para UX imediata
- o backend deriva `visit.expiresAt` remoto a partir de `/visits/{visitId}/notes`
- se a última nota da visita for removida, a visita expira localmente imediatamente e o backend passa a refletir isso remotamente
- visitas expiradas não aparecem mais no fluxo normal local
- acesso local a visita expirada tenta mostrar UX coerente de expiração, não erro enganoso de permissão

### 5) Cleanup local + remoto
Estado atual:
- frontend já remove/esconde localmente visitas/notas expiradas
- backend possui scheduler para cleanup global real de visitas expiradas
- backend também mantém `visit.expiresAt` remoto derivado das notas da visita
- sync foi endurecido para convergir melhor após cleanup remoto e evitar retries inúteis

### 6) Sugestões locais de tags
Estado atual:
- cada usuário possui uma tabela local materializada `userTagStats`
- as sugestões consideram tags de **todas as notas** das visitas localmente acessíveis ao usuário, inclusive visitas compartilhadas
- consideram apenas visitas/notas ativas
- `new-note-view` mostra:
  - top tags
  - filtro por prefixo com base no fragmento após a última vírgula
  - chips clicáveis para adicionar a sugestão
- as estatísticas locais são mantidas automaticamente por rebuild best-effort após mutações locais, sync remoto, realtime, limpeza por expiração e mudanças de acesso/visita

### 7) Listagem da visita sem separação por data da nota
Estado atual:
- a visita **não** é mais particionada visualmente por `note.date`
- a listagem principal dentro da visita é agrupada apenas por **tag**
- criar nota nova em visita antiga, mesmo no dia seguinte, não quebra mais a visita em blocos por data
- `note.date` continua existindo como metadado
- em `new-note-view`, no modo edição, a data da nota aparece de forma discreta como informação contextual

### 8) Hardening recente do sync sob rede oscilante
Estado atual:
- `pullRemoteNotes()` ficou mais conservador sob pull parcial/incompleto
- se falhar o fetch remoto de alguma visita, o app ainda aproveita o que chegou, mas **não faz cleanup destrutivo de órfãs naquele ciclo**
- `pullRemoteVisitMembershipsAndVisits()` ficou mais conservador para ausência ambígua:
  - continua limpando sinais fortes/confirmados
  - não faz mais purge imediato de `orphanedVisitIds` por evidência fraca
- `visits-view` e `dashboard-view` mostram estado mais conservador sob sync instável, em vez de empty state absoluto enganoso

### 9) Status do legado de notas após slices 1–4 + cleanup remoto
Estado atual:
- pull legado em `/users/{uid}/notes` removido
- escrita legada em `/users/{uid}/notes` removida
- script administrativo de auditoria/cleanup criado em `functions/src/scripts/legacy-user-notes-cleanup.ts`
- limpeza remota já executada no projeto `visitamed-36570`
- auditoria real antes do cleanup encontrou:
  - `37` docs legados
  - `37` com `visitId` válido
  - `0` sem `visitId`
  - `32` com correspondente em `/visits/{visitId}/notes/{noteId}`
  - `5` sem correspondente
- cleanup remoto executado com sucesso:
  - `37` docs legados apagados de `/users/{uid}/notes`
- fonte remota ativa para notas de visita consolidada em `/visits/{visitId}/notes/{noteId}`

### 10) Refatoração de naming de visitas (slices 1–3)
Estado atual:
- novas visitas não persistem mais data/mode dentro de `visit.name`
- `createPrivateVisit('HMH')` agora persiste `HMH`
- `createPrivateVisit()` agora persiste `Visita`
- dedupe por usuário + data continua com sufixos `(2)`, `(3)`, ...
- ao promover visita antiga para `group`, `ensureVisitIsGroup(...)` normaliza nomes legados como:
  - `HMH 01-04-2026 privada` -> `HMH`
  - `Visita 01-04-2026 privada (3)` -> `Visita`
- `visits-view` agora mostra o modo como badge visual:
  - `Privada`
  - `Compartilhada`
- `visit.name` passa a representar apenas o nome semântico da visita

### 11) UX de ações lentas da visita
Estado atual:
- `dashboard-view` agora mostra estado de processamento contextual nos modais de:
  - excluir visita
  - sair da visita
- durante a operação:
  - botão principal mostra spinner + texto (`Excluindo...`, `Saindo...`)
  - botões relevantes ficam desabilitados
  - duplo clique/reentrada é evitado
- em caso de erro:
  - o modal permanece aberto
  - erro inline é exibido
  - o usuário pode tentar novamente ou cancelar conscientemente

---

## Commits relevantes mais recentes

### Expiração / lifecycle
- `5f2d60c` fix(expiration): derive remote visit expiry from notes
- `2647662` fix(types): restore green build for expiration cleanup
- `baa0700` fix(sync): converge local cleanup after expired visit removal
- `c884357` feat(expiration): add visit lifecycle and cleanup flows

### Sugestões de tags
- `6e2241a` feat(tags): keep local tag suggestions in sync
- `eab8a46` feat(tags): add local tag suggestions to note form
- `c2b0e54` feat(tags): add local user tag suggestion stats

### Confiabilidade do sync / listagem da visita
- `f8f1c27` fix(sync): avoid destructive local cleanup on partial pull
- `556a050` fix(visit): stop grouping notes by note date

### Refatoração do legado de notas
- `c77b629` refactor(sync): stop pulling legacy user notes
- `82be003` refactor(sync): write visit notes to visit path
- `c23c742` chore(sync): add legacy user notes cleanup script
- `7d1f8f3` docs(sync): align legacy notes refactor status

### Refatoração de naming de visitas
- Slice 1 local: novas visitas deixam de persistir data/mode no `name`
- Slice 2 local: nomes legados são normalizados ao compartilhar (`ensureVisitIsGroup`)
- Slice 3 local: `visits-view` exibe badge de modo (`Privada` / `Compartilhada`)

### UX recente de ações de visita
- `dashboard-view` exibe spinner/estado de processamento em excluir visita e sair da visita
- em caso de erro, o modal permanece aberto com mensagem inline e affordance de retry

### Documentação recente
- `e1b1c94` docs(handoff): update visit note grouping behavior
- `57bd5bf` docs(handoff): add tag suggestions slices
- `a34e444` docs(handoff): update context with remote visit expiry trigger

### Colaboração / convites
- `97846dc` fix(collab): harden leave flow and invite accept hydration
- `8aa727c` fix(firestore): add collection-group index for invites.tokenHash
- `1904f31` feat(invites): add visit invite link generation and sharing
- `5df6530` feat(collab): support group visit deletion and leave flow

### Base anterior
- `8f0e7bd` fix(ui): reduce wasted top spacing in visit screen
- `dda1863` feat(visit): clarify delete-notes UX and add private visit deletion flow
- `576f39b` fix(firestore): add collection-group index for members.userId
- `d724d5b` fix(sync): unblock cross-device hydration and harden note payload
- `8769256` chore(functions): upgrade runtime to node22 and firebase sdk

---

## Implementações consolidadas

### A) Leave visit remoto autorizado
Arquivos principais:
- `functions/src/index.ts`
- `firebase.json`
- `src/services/db/visits-service.ts`
- `src/services/db/visits-service.test.ts`

Resumo:
- endpoint autenticado `POST /api/visits/leave`
- backend valida membership ativo e bloqueia owner
- frontend limpa localmente visita/notas/members/invites relacionados
- frontend remove pendências da sync queue daquela visita
- não usa mais `visit-member:update` client-side para esse caso

### B) Aceite de convite aguardando hidratação local
Arquivos principais:
- `src/views/invite-accept-view.ts`
- `src/views/invite-accept-view.test.ts`

Resumo:
- spinner + texto **“Preparando sua visita”**
- sync/hidratação explícitos após `accepted` / `already-member`
- polling local até visita + membership ficarem prontos
- fallback seguro em timeout

### C) Slice 1 de expiração — base de dados
Arquivos principais:
- `src/models/visit.ts`
- `src/services/db/dexie-db.ts`
- `src/services/db/notes-service.ts`
- `src/services/sync/sync-service.ts`

Resumo:
- `Visit.expiresAt` adicionado
- visita nasce com `+14 dias`
- notas renovam expiração em updates
- `visit.expiresAt` acompanha create/update de nota
- sync remoto passa a persistir/hidratar `visit.expiresAt`

### D) Slice 2 de expiração — lifecycle local + UX
Arquivos principais:
- `src/utils/visit-expiration.ts`
- `src/services/db/local-expiration-cleanup.ts`
- `src/services/db/visits-service.ts`
- `src/services/db/notes-service.ts`
- `src/views/dashboard-view.ts`
- `src/views/new-note-view.ts`
- `src/app.ts`

Resumo:
- visitas expiradas somem da listagem normal
- `getVisitById()` trata visita expirada como indisponível localmente
- limpeza local remove visita expirada + dados relacionados + fila ligada à visita
- deletar a última nota faz a visita expirar localmente imediatamente
- UX local específica para visita expirada evita mensagem enganosa de permissão

### E) Slice 3 de expiração — cleanup global remoto
Arquivos principais:
- `functions/src/index.ts`

Resumo:
- nova Cloud Function v2 agendada:
  - `cleanupExpiredVisitsScheduler`
  - frequência: `every 15 minutes`
  - região: `southamerica-east1`
- busca visitas expiradas por `visit.expiresAt <= now`
- remove globalmente:
  - `/visits/{visitId}`
  - subcoleções (`members`, `invites`, `notes`)
  - documentos de notas ainda vinculados ao `visitId` via `collectionGroup('notes').where('visitId', '==', visitId)`
- usa `recursiveDelete(visitRef)` para limpeza da árvore da visita
- logs básicos de execução/resumo

### F) Slice 4 de expiração — hardening de convergência
Arquivos principais:
- `src/services/sync/sync-service.ts`
- `src/services/sync/sync-service.test.ts`
- `src/services/db/local-expiration-cleanup.ts`

Resumo:
- limpeza local consolidada por `visitId` remove também `visitInvites`
- pull remoto de memberships/visitas usa limpeza local mais completa
- `handleSyncError(...)` descarta dados locais e fila quando a visita já foi removida remotamente (casos pragmáticos como `not-found` e heurísticas relacionadas)
- `syncNow()` evita processar item já removido da fila no mesmo ciclo
- hotfix posterior evita purge local indevido em `visit:update + permission-denied`

### G) Correção estrutural pós-slices — backend deriva expiração remota da visita
Arquivos principais:
- `functions/src/index.ts`
- `src/services/db/notes-service.ts`
- testes de `notes-service`

Resumo:
- nova trigger backend Firestore v2:
  - `deriveVisitExpirationFromNotes`
  - observa `/visits/{visitId}/notes/{noteId}`
- a cada create/update/delete de nota da visita:
  - recalcula `visit.expiresAt` remoto com base no maior `expiresAt` válido das notas restantes
  - atualiza `visit.updatedAt`
- se não restarem notas válidas:
  - define `visit.expiresAt = now`
- o frontend continua atualizando `visit.expiresAt` localmente para UX imediata,
  mas **não enfileira mais `visit:update` remoto derivado de mutação de nota**
- isso remove o acoplamento errado que fazia `editor` gerar `permission-denied` ao tentar atualizar `/visits/{visitId}`

### H) Sugestões de tags — Slice 1: fundação local
Arquivos principais:
- `src/models/user-tag-stat.ts`
- `src/services/db/dexie-db.ts`
- `src/services/db/user-tag-stats-service.ts`
- testes de `user-tag-stats-service`

Resumo:
- nova tabela local `userTagStats`
- estatísticas materializadas por usuário (`id`, `userId`, `tag`, `count`, `lastUsedAt`, `updatedAt`)
- rebuild completo simples a partir das visitas/notas locais acessíveis e ativas
- leitura de top sugestões e busca por prefixo
- `clearLocalUserData()` também limpa `userTagStats`

### I) Sugestões de tags — Slice 2: UI em `new-note-view`
Arquivos principais:
- `src/views/new-note-view.ts`
- `src/views/new-note-tag-suggestions.ts`
- `src/views/new-note-tag-suggestions.test.ts`

Resumo:
- `new-note-view` mostra chips de sugestões abaixo do campo de tags
- sem prefixo útil, mostra top tags do usuário
- com prefixo útil, busca pelo fragmento após a última vírgula
- clicar em um chip:
  - adiciona a sugestão
  - preserva tags completas já digitadas antes da última vírgula
  - evita duplicatas
  - limpa o input
- fluxo atual de `Adicionar` / `Enter` continua válido

### J) Sugestões de tags — Slice 3: rebuild automático
Arquivos principais:
- `src/services/db/user-tag-stats-service.ts`
- `src/services/db/notes-service.ts`
- `src/services/db/visits-service.ts`
- `src/services/db/dexie-db.ts`
- `src/services/sync/sync-service.ts`

Resumo:
- helper central `triggerCurrentUserTagStatsRebuild()`
- rebuild best-effort após:
  - `saveNote`, `updateNote`, `deleteNote`, `deleteNotes`, `removeTagFromNote`
  - `deletePrivateVisit`, `leaveVisit`, `deleteGroupVisitAsOwner`
  - cleanup local por expiração
  - `pullRemoteNotes`, `pullRemoteVisitMembershipsAndVisits`
  - realtime da visita ativa
- falha no rebuild não quebra UI nem sync
- `new-note-view` pode manter rebuild ao abrir como fallback seguro

### K) Listagem da visita — notas deixam de ser agrupadas por data
Arquivos principais:
- `src/views/dashboard-view.ts`
- `src/views/new-note-view.ts`
- `src/utils/group-notes-by-tag.ts`
- `src/utils/group-notes-by-tag.test.ts`

Resumo:
- `dashboard-view` deixa de usar agrupamento por `note.date`
- a visita passa a listar notas agrupadas somente por tag
- o escopo principal do dashboard fica simplificado para ações por tag
- `date-group` deixa de estruturar a listagem principal da visita
- `note.date` permanece no modelo, mas vira metadado
- em modo de edição, `new-note-view` mostra `Data da nota: dd-mm-aaaa`

### L) Confiabilidade do sync — evitar limpeza destrutiva sob pull parcial
Arquivos principais:
- `src/services/sync/sync-service.ts`
- `src/services/sync/sync-service.test.ts`
- `src/views/visits-view.ts`
- `src/views/dashboard-view.ts`

Resumo:
- `pullRemoteNotes()` detecta pull parcial por visita e pula cleanup destrutivo de órfãs nesse ciclo
- `pullRemoteVisitMembershipsAndVisits()` não faz mais purge imediato de `orphanedVisitIds` por ausência ambígua
- `visits-view` e `dashboard-view` mostram estados mais conservadores sob sync instável
- logs foram endurecidos para diferenciar pull parcial, cleanup pulado e ausência ambígua

### M) Refatoração do legado de notas — status atualizado
Status:
- Slice 1 concluído: app não faz mais pull legado de notas por usuário
- Slice 2 concluído: app não escreve mais notas de visita no path legado
- Slice 3 concluído: script de auditoria/cleanup remoto disponível para execução controlada

Direção operacional agora:
1. rodar auditoria real (dry-run) no projeto Firebase
2. validar volume e amostras do relatório
3. executar cleanup seletivo com `--apply`
4. manter monitoramento de sync após limpeza

Próximo slice técnico opcional:
- limpeza residual pequena de comentários/docs correntes (sem reescrever histórico)

Recomendação mantida:
- **não apagar todo o Firestore**; apagar apenas os registros legados de notas após auditoria

---

## Deploys / infraestrutura já aplicados

### Hosting + Functions
Deploys recentes executados com sucesso:
```bash
firebase deploy --only hosting,functions --project visitamed-36570 --force
firebase deploy --only hosting --project visitamed-36570 --force
```

Resultados importantes:
- `cleanupExpiredVisitsScheduler(southamerica-east1)` criado com sucesso
- `deriveVisitExpirationFromNotes(southamerica-east1)` criado com sucesso
- hosting publicado/atualizado em `https://visitamed-36570.web.app`
- fixes recentes de sync confiável e listagem da visita já estão publicados em hosting

### APIs / serviços habilitados no projeto
Durante o deploy do scheduler, o Firebase habilitou:
- `cloudscheduler.googleapis.com`

### Índice de convites por token
Já existe fix no repositório para:
- `collectionGroup('invites').where('tokenHash', '==', tokenHash)`

Arquivo / commit:
- `firestore.indexes.json`
- `8aa727c`

Se houver dúvida operacional, confirmar no Firebase Console se o índice de `invites.tokenHash` está `Ready`.

---

## Testes / validações recentes reportadas

### Colaboração
- leave visit remoto: `typecheck`, `lint`, `test`, `functions build` reportados como ok
- invite accept hydration UX: `typecheck`, `lint`, `test` reportados como ok

### Expiração
- Slice 1: `typecheck`, `lint`, `test` reportados como ok
- Slice 2: `typecheck`, `lint`, `test` reportados como ok
- Slice 3: blocker de Timestamp corrigido no scheduler; `functions build` ok
- Slice 4: `typecheck`, `lint`, `test` reportados como ok
- Correção estrutural da expiração remota da visita:
  - `typecheck` ✅
  - `lint` ✅
  - `test` ✅
  - `npm --prefix functions run build` ✅

### Sugestões de tags
- Slice 1 (fundação local):
  - `typecheck` ✅
  - `lint` ✅
  - `test` ✅
- Slice 2 (UI em `new-note-view`):
  - `typecheck` ✅
  - `lint` ✅
  - `test` ✅
- Slice 3 (rebuild automático):
  - `typecheck` ✅
  - `lint` ✅
  - `test` ✅

### Listagem da visita sem agrupamento por data
- `typecheck` ✅
- `lint` ✅
- `test` ✅
- `npm run build` ✅
- deploy de hosting ✅

### Confiabilidade do sync
- `typecheck` ✅
- `lint` ✅
- `test` ✅
- `npm run build` ✅
- deploy de hosting ✅

- Build final local antes do deploy:
  - `npm run build` ✅
  - `npm --prefix functions run build` ✅

---

## Arquivos mais importantes para retomar rapidamente

### Colaboração / convites
- `functions/src/index.ts`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `src/services/db/visits-service.ts`
- `src/services/db/visits-service.test.ts`
- `src/services/db/visit-invites-service.ts`
- `src/views/invite-accept-view.ts`
- `src/views/invite-accept-view.test.ts`

### Expiração / lifecycle
- `src/models/visit.ts`
- `src/services/db/dexie-db.ts`
- `src/services/db/local-expiration-cleanup.ts`
- `src/services/db/notes-service.ts`
- `src/services/db/visits-service.ts`
- `src/services/sync/sync-service.ts`
- `src/services/sync/sync-service.test.ts`
- `src/utils/visit-expiration.ts`
- `src/views/dashboard-view.ts`
- `src/views/new-note-view.ts`
- `src/views/visits-view.ts`
- `functions/src/index.ts`

### Sugestões de tags
- `src/models/user-tag-stat.ts`
- `src/services/db/user-tag-stats-service.ts`
- `src/services/db/user-tag-stats-service.test.ts`
- `src/views/new-note-tag-suggestions.ts`
- `src/views/new-note-tag-suggestions.test.ts`
- `src/views/new-note-view.ts`
- `src/services/db/notes-service.ts`
- `src/services/db/visits-service.ts`
- `src/services/sync/sync-service.ts`
- `src/services/db/dexie-db.ts`

### Listagem da visita
- `src/views/dashboard-view.ts`
- `src/views/new-note-view.ts`
- `src/utils/group-notes-by-tag.ts`
- `src/utils/group-notes-by-tag.test.ts`
- `src/components/groups/tag-group.ts`

### Sync / legado de notas
- `src/services/sync/sync-service.ts`
- `src/services/sync/sync-service.test.ts`
- `functions/src/index.ts`
- `src/services/db/notes-service.ts`
- `src/views/visits-view.ts`
- `src/views/dashboard-view.ts`

---

## Próximos ajustes / features prováveis

### 1) Smoke tests manuais pós-refatoração
Prioridade alta:
- criar visita nova com nome custom (`HMH`) e confirmar que o card mostra:
  - nome limpo
  - badge `Privada`
  - data separada
- compartilhar visita nova e confirmar badge `Compartilhada`
- compartilhar visita antiga com nome legado e confirmar normalização do nome
- reproduzir o bug original de nota removida por convidado para confirmar que não ressuscita mais
- validar edição/save em visita compartilhada após as mudanças recentes
- validar UX dos modais de excluir/sair visita:
  - spinner durante processamento
  - modal aberto com erro inline em caso de falha

### 2) Observação inicial do scheduler e da trigger de expiração
Prioridade alta:
- aceitar convite como `viewer` e `editor`
- validar `leave visit`
- validar exclusão de visita colaborativa pelo owner
- validar expiração local ao apagar a última nota
- validar convergência após cleanup backend
- reproduzir o cenário de nota removida por convidado para confirmar que não ressuscita mais após o cleanup legado

### 3) Observação inicial do scheduler e da trigger de expiração
Vale inspecionar os logs das primeiras execuções do:
- `cleanupExpiredVisitsScheduler`
- `deriveVisitExpirationFromNotes`

Para confirmar:
- se visitas expiradas estão sendo limpas corretamente
- se a trigger recalcula `visit.expiresAt` como esperado
- se não houve erro inesperado de Eventarc/trigger/permite
- se o volume de logs está razoável

### 4) Refinamentos futuros da UX de tags
Possíveis refinamentos futuros:
- auto-add no blur
- auto-add ao salvar
- texto de ajuda mais explícito
- feedback melhor do motivo do botão `Salvar` desabilitado
- debounce/coalescing simples se o rebuild automático de sugestões ficar frequente demais
- pequenos ajustes visuais nos chips/sugestões conforme uso real

### 5) Próximo refinamento possível da listagem da visita
Possíveis próximos passos:
- avaliar se faz sentido adicionar ação de exportar/compartilhar a visita inteira, já que o escopo por data saiu da UI principal
- considerar mostrar data também em `note-item` se isso ajudar contexto sem poluir a tela

### 6) Gestão visual de membros/convites
Possíveis próximos slices:
- listar convites ativos
- revogar convite pela UI
- listar membros
- remover membro pela UI

### 7) Ação de visita também em `visits-view`
Pode ainda ser útil adicionar affordance de excluir/sair já na listagem de visitas.

---

## Comandos úteis

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm --prefix functions run build
firebase deploy --only hosting,functions --project visitamed-36570 --force
firebase deploy --only firestore:indexes --project visitamed-36570 --force
firebase functions:log --project visitamed-36570
```

---

## Estado atual do workspace local

Artefatos locais que costumam aparecer e não devem entrar por engano:
- `functions/lib/`
- `firestoredb.output-0`

Observações:
- `functions/lib/` é artefato de build local das Cloud Functions
- `firestoredb.output-0` é dump local usado em depuração

---

## Recomendação de retomada após reset

1. Ler este arquivo.
2. Considerar concluída a refatoração do legado de notas em código e a limpeza remota já executada no projeto Firebase.
3. Retomar pelos smoke tests manuais de colaboração/naming de visitas e pelo acompanhamento de sync compartilhado.
4. Não fazer wipe completo do Firestore; o cleanup seletivo do legado de notas já foi executado com sucesso.
5. Se a UI de naming estiver estável, priorizar próximos refinamentos funcionais menores.
