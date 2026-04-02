# HANDOFF + PROMPT — S12C (Limpeza do legado `ward-*`)

## Contexto atual
- S12A: UI tags-first concluída (sem campo ala na tela de nota).
- S12B: core de criação/edição/validação de nota sem `ward` obrigatório.
- Ainda restam legados `ward-*` em models/services/sync/settings/tests.

## Objetivo do slice
Remover o legado `ward-*` do código ativo, mantendo app funcional e compilando.

## Escopo (vertical, mas focado)

### 1) Remover stack de Ward Stats
Remover referências ativas a `ward-stat`/`ward-stats-service`:
- `src/models/ward-stat.ts` (e testes associados)
- `src/services/db/ward-stats-service.ts` (e testes associados)
- referências em `notes-service`, `settings-service`, `settings-view`, `sync-service`, `app.ts`, etc.

### 2) Simplificar Settings (sem ward preferences)
Arquivos principais:
- `src/models/settings.ts`
- `src/services/settings/settings-service.ts`
- `src/views/settings-view.ts`
- testes de settings

Aplicar:
- remover `uppercaseWard` de `InputPreferences`
- remover `wardPreferences` inteiramente
- manter apenas preferências úteis (ex.: `uppercaseBed`)
- ajustar normalização para ignorar payload legado sem quebrar (`normalizeSettings` deve continuar robusto)
- simplificar UI de Configurações removendo seções de alas frequentes/ocultas/editar label

### 3) Limpar sync de `wardStat`
Arquivos principais:
- `src/models/sync-queue.ts`
- `src/services/sync/sync-service.ts`
- `src/app.ts`
- testes de sync

Aplicar:
- remover `entityType: 'wardStat'`
- remover fluxos `increment`/`processWardStatSyncItem` e pull de `wardStats`
- remover chamada `pullRemoteWardStats()` do app
- manter sync de `note` e `settings` funcionando

### 4) Remover `ward` residual de contratos/dados ativos
Arquivos principais:
- `src/models/note.ts`
- `src/services/db/visits-service.ts`
- `src/services/db/dexie-db.ts`
- `src/services/sync/sync-service.ts`
- testes afetados

Aplicar:
- remover `ward` do tipo `Note` e de `createNote`
- remover usos residuais em duplicação de visita
- ajustar índices Dexie de `notes` para não depender de `ward` (criar nova versão Dexie incremental)
- remover helper legado `getNotesByWard`
- manter conversão de dados remotos defensiva: se houver `ward` em payload remoto, ignorar sem quebrar

### 5) Firestore rules
- manter rules já sem exigência de `ward` (S12B), apenas revisar consistência final após remoções.

## Fora de escopo
- refatoração estética ampla
- mudanças de produto além de tags-first

## Critérios de aceite
- app compila e roda sem stack `ward-*` ativa
- settings/sync seguem funcionais sem conceitos de ward
- notas seguem funcionais com `visit + tags + bed + note`
- validações verdes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S12C - Limpeza do legado `ward-*` (stats/settings/sync/tests)**.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice12b-core-tags-first-no-ward-required-handoff-prompt.md`
4) `docs/collab-slice12c-remove-ward-legacy-stack-handoff-prompt.md`
5) `src/models/note.ts`
6) `src/models/settings.ts`
7) `src/models/sync-queue.ts`
8) `src/services/db/dexie-db.ts`
9) `src/services/db/notes-service.ts`
10) `src/services/settings/settings-service.ts`
11) `src/views/settings-view.ts`
12) `src/services/sync/sync-service.ts`
13) `src/app.ts`

## Escopo obrigatório
1. Remover stack `ward-stat` (model/service/usos/testes).
2. Simplificar settings removendo `uppercaseWard` e `wardPreferences`.
3. Remover sync/pull de `wardStat` e chamadas no app.
4. Remover `ward` residual de contratos ativos de nota e índices Dexie relacionados.
5. Ajustar testes estritamente necessários para novo estado tags-first.

## Regras
- Sem compatibilidade retroativa desnecessária.
- Solução simples e incremental, sem abstração extra.
- Evitar refatoração ampla fora do escopo.

## Validação obrigatória
Rodar e reportar:
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## Entrega
- lista de arquivos alterados/removidos
- resumo curto das decisões
- resultado dos 4 comandos
```
