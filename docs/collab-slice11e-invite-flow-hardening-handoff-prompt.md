# HANDOFF + PROMPT — S11E (Hardening do fluxo remoto de convites)

## Contexto atual
- S11A: endpoint `/api/invites/accept` criado.
- S11B: create/list/revoke de convites já remotos em Firestore.
- S11C: backend já aceita convite por token com transação de membership.
- S11D: frontend já usa endpoint remoto para aceite.

## Objetivo do slice
Fechar hardening mínimo de produção para convites remotos:
1) **token hash em repouso** (não armazenar token bruto no Firestore),
2) **rate limit básico** no endpoint de aceite,
3) **auditoria mínima de aceite** no convite.

## Escopo (micro)

### 1) Token hash (SHA-256) como fonte de verdade
Arquivos alvo:
- `src/services/db/visit-invites-service.ts`
- `functions/src/index.ts`

Implementar:
- Ao criar convite (`createVisitInviteForVisit`):
  - continuar gerando token bruto para retorno ao cliente,
  - persistir no Firestore `tokenHash` (SHA-256 hex),
  - **não persistir `token` em texto puro** no documento remoto.
- No endpoint de aceite:
  - calcular hash do token recebido,
  - buscar convite por `tokenHash` (não por token puro).

> Sem fallback legado por token puro (evitar compat retroativa desnecessária).

### 2) Rate limit básico no backend
Arquivo alvo:
- `functions/src/index.ts`

Implementar proteção simples por `uid`:
- guardar último timestamp de tentativa em coleção técnica (ex.: `_meta/inviteAcceptRateLimit/{uid}` ou equivalente simples).
- se nova tentativa ocorrer antes do cooldown (ex.: 2s), responder:
  - `429 { error: 'rate-limited' }`

### 3) Auditoria mínima de aceite
Arquivo alvo:
- `functions/src/index.ts`

Quando status final for `accepted`, atualizar convite com:
- `acceptedCount` (increment)
- `lastAcceptedAt` (server timestamp)
- `lastAcceptedByUserId` (uid)

### 4) Frontend: mapear 429
Arquivo alvo:
- `src/services/db/visit-invites-service.ts`
- `src/services/db/visit-invites-service.test.ts`

Implementar:
- tratar `HTTP 429` em `acceptVisitInviteByToken` com erro explícito (`InviteAcceptError`)
- cobrir com teste.

## Fora de escopo
- Criptografia além de hash (KMS etc.).
- App Check/WAF/infra avançada.
- Refatoração ampla.

## Critérios de aceite
- Firestore não guarda token bruto de convite novo.
- Endpoint aceita convite por hash do token.
- Endpoint retorna 429 em burst de tentativas do mesmo usuário.
- Convite recebe auditoria de aceite no status `accepted`.
- Frontend lida com 429 de forma explícita.
- Validação local verde:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `cd functions && npm run build`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S11E - Hardening do fluxo remoto de convites (hash/rate-limit/auditoria)** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice11c-invite-accept-backend-transaction-handoff-prompt.md`
4) `docs/collab-slice11d-frontend-accept-via-endpoint-handoff-prompt.md`
5) `docs/collab-slice11e-invite-flow-hardening-handoff-prompt.md`
6) `src/services/db/visit-invites-service.ts`
7) `src/services/db/visit-invites-service.test.ts`
8) `functions/src/index.ts`

## Escopo
1. Persistir `tokenHash` (SHA-256 hex) em convites remotos e parar de persistir token bruto.
2. No endpoint `/api/invites/accept`, buscar convite por `tokenHash` calculado do token recebido.
3. Implementar rate-limit simples por usuário no endpoint (cooldown ~2s), retornando `429 { error:'rate-limited' }`.
4. Implementar auditoria mínima no convite quando `accepted`:
   - `acceptedCount` increment
   - `lastAcceptedAt` server timestamp
   - `lastAcceptedByUserId` uid
5. No frontend, tratar HTTP 429 em `acceptVisitInviteByToken` com erro explícito + teste.

## Restrições
- NÃO adicionar compatibilidade retroativa desnecessária (sem fallback por token puro).
- NÃO fazer refatoração ampla.
- NÃO alterar UI/rotas.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `cd functions && npm run build`

## Entrega
- arquivos alterados
- resumo objetivo
- resultado dos 4 comandos
```
