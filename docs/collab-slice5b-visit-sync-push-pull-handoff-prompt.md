# HANDOFF + PROMPT — S5B (Sync push/pull por visita, baseline)

## Contexto atual
- S5A concluído: regras Firestore colaborativas para `/visits/{visitId}/...` já existem.
- Sync atual ainda é majoritariamente legado em `/users/{uid}/notes`.
- Precisamos avançar para sync por visita sem quebrar fluxo atual.

## Objetivo do slice
Implementar um **baseline incremental** de sync por visita para notas:
- **Push**: espelhar nota também em `/visits/{visitId}/notes/{noteId}`
- **Pull**: trazer notas de `/visits/{visitId}/notes` para visitas onde há membership local ativo
- Manter compatibilidade com legado (`/users/{uid}/notes`) para não quebrar produção

## Escopo (micro)

### 1) Push por visita (mirror não-bloqueante)
Em `src/services/sync/sync-service.ts`, dentro do fluxo de sync de nota:
- manter push legado atual para `/users/{uid}/notes/{noteId}`
- adicionar mirror para `/visits/{visitId}/notes/{noteId}` quando `note.visitId` existir
- mirror por visita deve ser **best-effort**:
  - se falhar, **não** quebrar a remoção do item da fila legado
  - apenas logar warning

### 2) Bootstrap mínimo para owner local (best-effort)
Antes de mirror por visita, tentar garantir dados mínimos remotos para visita privada owner:
- se houver membership local ativo do usuário para `visitId` com role `owner`, fazer `setDoc(..., { merge: true })` de:
  - `/visits/{visitId}` (campos essenciais)
  - `/visits/{visitId}/members/{uid}` como owner ativo
- também em modo best-effort (sem interromper sync legado)

### 3) Pull por visita (incremental)
No `pullRemoteNotes()`:
- manter pull legado atual de `/users/{uid}/notes`
- adicionalmente, para cada membership local ativo (`db.visitMembers`) do usuário:
  - ler `/visits/{visitId}/notes`
  - converter para `Note` local
- combinar notas remotas de ambos os caminhos com deduplicação por `id`
  - em caso de duplicata, manter versão mais nova (`updatedAt ?? createdAt`)
- seguir aplicando `resolveNoteConflict` contra local

### 4) Teste mínimo (TDD seletivo)
Adicionar/ajustar testes em `src/services/sync/sync-service.test.ts` para a lógica pura nova (dedupe/merge por timestamp) se você criar helper exportado.

## Fora de escopo
- Sync remoto de `members` e `invites` completos.
- Cloud Functions.
- Realtime.
- Mudanças de UI.
- Refatoração ampla do sync-service.

## Critérios de aceite
- sync legado continua funcionando.
- push por visita não derruba sync se rota colaborativa falhar.
- pull por visita agrega notas das visitas com membership local ativo.
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S5B - Sync push/pull por visita (baseline incremental)** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice5b-visit-sync-push-pull-handoff-prompt.md`
4) `src/services/sync/sync-service.ts`

## Escopo
1. Em `sync-service.ts`, manter sync legado e adicionar mirror de nota para `/visits/{visitId}/notes/{noteId}` (best-effort).
2. Adicionar bootstrap mínimo best-effort para owner local:
   - `/visits/{visitId}`
   - `/visits/{visitId}/members/{uid}` owner ativo
3. Em `pullRemoteNotes()`, além de `/users/{uid}/notes`, puxar também de `/visits/{visitId}/notes` para memberships locais ativos.
4. Deduplicar por `id` com regra de timestamp mais novo (`updatedAt ?? createdAt`).
5. Se criar helper puro de dedupe/merge, adicionar testes em `sync-service.test.ts`.

## Restrições
- NÃO alterar UI.
- NÃO implementar Cloud Functions/realtime.
- NÃO quebrar caminho legado de sync.
- Diff pequeno e focado.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- Arquivos alterados
- Resumo curto do que foi feito
- Resultado dos 3 comandos
```
