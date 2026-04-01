# HANDOFF + PROMPT — S6A (Duplicar visita: nova data + novo owner)

## Contexto atual
- S1–S5D concluídos (visitas, membros, convites, ACL, sync colaborativo e realtime da visita ativa).
- Próximo passo funcional: permitir duplicação de visita para criar uma **visita privada independente**.
- Regra de produto já congelada:
  - duplicar visita copia conteúdo e cria visita independente;
  - `owner/editor/viewer` ativos podem duplicar para privada própria;
  - nova visita deve ter **novo owner = usuário atual** e **nova data (hoje)**.

## Objetivo do slice
Implementar a base de domínio/persistência para duplicar uma visita localmente, sem mexer em UI neste slice.

## Escopo (micro)

### 1) Serviço de duplicação em `visits-service`
Em `src/services/db/visits-service.ts`, adicionar função exportada (nome sugerido):
- `duplicateVisitAsPrivate(sourceVisitId: string): Promise<Visit>`

Comportamento esperado:
1. Validar usuário autenticado (`requireUserId`).
2. Verificar permissão de duplicação na visita origem:
   - membership do usuário atual na visita origem deve existir e estar ativo;
   - usar regra existente (`canDuplicateVisit`) para decisão.
3. Criar **nova visita privada**:
   - `userId = usuário atual`
   - `mode = 'private'`
   - `date = getCurrentDate()`
   - `name`: pode reaproveitar nome origem com sufixo simples (ex.: `"<nome> (cópia)"`) ou regra simples equivalente.
4. Criar membership owner da nova visita (`createOwnerVisitMember`).
5. Copiar notas da visita origem para a nova visita:
   - clonar campos clínicos (`ward`, `bed`, `note`, `reference`)
   - novo `id`
   - `visitId = nova visita`
   - `userId = usuário atual`
   - `date = nova data da visita`
   - `syncStatus = 'pending'`
   - reset de `syncedAt`
6. Enfileirar sync `create` para cada nota duplicada (`syncQueue`).
7. Fazer tudo em transação Dexie atômica (`visits`, `visitMembers`, `notes`, `syncQueue`).

### 2) Testes (TDD seletivo)
Adicionar/expandir testes em `src/services/db/visits-service.test.ts` cobrindo pelo menos:
- sucesso: cria nova visita privada com owner atual e duplica notas;
- sem auth: erro;
- sem membership ativo na origem: erro de permissão;
- membership removido: não duplica;
- verifica queue `create` para notas duplicadas.

## Fora de escopo
- Botão/fluxo de UI para duplicar.
- Realtime adicional.
- Rules/functions remotas.
- Refatoração ampla.

## Critérios de aceite
- Função de duplicação disponível no service e funcionando em transação única.
- Nova visita é independente (novo `visitId`, novo owner, nova data).
- Notas duplicadas entram como `pending` e com itens na `syncQueue`.
- `npm run typecheck`, `npm run lint`, `npm test` verdes.

---

## Prompt pronto para colar (nova conversa)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S6A - Duplicar visita (nova data, novo owner)** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice6a-duplicate-visit-private-owner-handoff-prompt.md`
4) `src/services/db/visits-service.ts`
5) `src/services/db/visits-service.test.ts`
6) `src/services/auth/visit-permissions.ts`

## Escopo
1. Em `visits-service.ts`, adicionar função exportada para duplicar visita em modo privado para o usuário atual.
2. Validar permissão por membership ativo (usar regra de `canDuplicateVisit`).
3. Criar nova visita (`date` atual, owner atual, modo private) + owner membership.
4. Duplicar notas da visita origem para nova visita (novos IDs, syncStatus pending, data da nova visita).
5. Enfileirar sync `create` para cada nota duplicada.
6. Fazer persistência em transação atômica.
7. Adicionar testes em `visits-service.test.ts` para sucesso + principais erros de permissão/auth.

## Restrições
- NÃO alterar UI.
- NÃO implementar features remotas extras.
- NÃO fazer refatoração ampla.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Entrega
- Arquivos alterados
- Resumo curto da função de duplicação
- Resultado dos 3 comandos
```
