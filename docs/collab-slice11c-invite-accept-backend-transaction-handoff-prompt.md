# HANDOFF + PROMPT — S11C (Aceite real por token no backend)

## Contexto atual
- S11A concluído: endpoint autenticado `/api/invites/accept` existe, mas está em modo baseline.
- S11B concluído: create/list/revoke de convites já usam Firestore remoto em `/visits/{visitId}/invites/{inviteId}`.
- `acceptVisitInviteByToken` no frontend ainda está local/transitório (Dexie) e será migrado em S11D.

## Objetivo do slice
Implementar no backend (Cloud Functions) a lógica real de aceite por token, com transação e statuses de negócio compatíveis com o frontend.

## Escopo (micro)

### 1) Implementar lógica real no endpoint `acceptInviteEndpoint`
Arquivo: `functions/src/index.ts`

Fluxo esperado no `POST /api/invites/accept`:
1. validar auth (`Authorization: Bearer <idToken>`) — já existe
2. validar body `{ token: string }` — já existe
3. buscar convite remoto por token em Firestore (query em `invites`)
4. se não encontrado: `200 { status: 'invite-not-found' }`
5. validar convite:
   - revogado -> `200 { status: 'invite-revoked', visitId }`
   - expirado -> `200 { status: 'invite-expired', visitId }`
6. rodar transação no membership `/visits/{visitId}/members/{uid}`:
   - se já `active` -> `200 { status: 'already-member', visitId }`
   - se já `removed` -> `200 { status: 'access-revoked', visitId }`
   - se não existe -> criar membership `active` com role do convite (`editor|viewer`) e retornar `200 { status: 'accepted', visitId }`

### 2) Semântica de resposta
- Erros de protocolo continuam HTTP:
  - 400 invalid-request
  - 401 unauthenticated
  - 405 method-not-allowed
  - 500 internal-error
- Estados de negócio do convite retornam **HTTP 200** com `status`.

### 3) Compatibilidade de dados
- Convite pode ter timestamps em formatos diferentes (Timestamp/Date/string) por legado incremental.
- Implementar parser defensivo de data no backend para `expiresAt` e `revokedAt`.
- `visitId` preferencialmente vindo do campo do convite; fallback para path do documento quando aplicável.

### 4) Fora de escopo
- NÃO migrar frontend para chamar endpoint (S11D).
- NÃO introduzir hash de token/rate-limit/auditoria (S11E).
- NÃO alterar regras/firestore schema além do necessário para S11C.

## Critérios de aceite
- Endpoint retorna corretamente todos os statuses:
  - `accepted`
  - `already-member`
  - `invite-not-found`
  - `invite-expired`
  - `invite-revoked`
  - `access-revoked`
- Criação de membership no backend ocorre de forma atômica (transação).
- Sem regressão no comportamento de auth/validação HTTP.
- Validação local verde:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `cd functions && npm run build`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S11C - Aceite real por token no backend (transação + statuses)** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice11a-invite-accept-endpoint-baseline-handoff-prompt.md`
4) `docs/collab-slice11b-remote-invites-firestore-handoff-prompt.md`
5) `docs/collab-slice11c-invite-accept-backend-transaction-handoff-prompt.md`
6) `functions/src/index.ts`
7) `src/models/visit-member.ts`
8) `src/services/db/visit-invites-service.ts`

## Escopo
1. No endpoint `acceptInviteEndpoint` (`functions/src/index.ts`), implementar lógica real de aceite:
   - buscar convite por token no Firestore
   - validar revogado/expirado
   - transação para membership em `/visits/{visitId}/members/{uid}`
   - retornar status de negócio (HTTP 200) compatível com frontend
2. Manter erros de protocolo (400/401/405/500) como já está.
3. Implementar parsing defensivo de timestamps (`expiresAt`, `revokedAt`).

## Regras de status (HTTP 200)
- `invite-not-found`
- `invite-revoked` (+ visitId)
- `invite-expired` (+ visitId)
- `already-member` (+ visitId)
- `access-revoked` (+ visitId)
- `accepted` (+ visitId)

## Restrições
- NÃO alterar frontend neste slice.
- NÃO implementar token hash/rate-limit/auditoria ainda.
- NÃO fazer refatoração ampla.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `cd functions && npm run build`

## Entrega
- Arquivos alterados
- Resumo curto da lógica implementada
- Resultado dos 4 comandos
```
