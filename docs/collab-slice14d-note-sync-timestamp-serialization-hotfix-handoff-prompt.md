# HANDOFF + PROMPT — S14D (Hotfix serialização de timestamps no sync de notas)

## Contexto do problema
Teste manual reportou inconsistência grave:
- notas/visitas criadas em um dispositivo online não aparecem em outro após tempo suficiente,
- em alguns cenários, após relogin os dados parecem “sumir”.

## Hipótese validada no código
No `sync-service`, o payload de nota é lido com `JSON.parse` e enviado ao Firestore sem normalização robusta de tipos de data.
Isso pode quebrar regras que esperam `timestamp` (especialmente em `/users/{uid}/notes`) e gerar `permission-denied` indevido por formato.

## Objetivo do slice
Garantir que writes de nota para Firestore usem timestamps válidos (Date/Timestamp), evitando falha de sync por tipo incorreto.

## Escopo (micro)

### 1) Normalização explícita de payload de nota para Firestore
Arquivo: `src/services/sync/sync-service.ts`

Implementar helper puro exportado (nome sugerido):
- `serializeNoteForFirestore(note: Note): DocumentData`

Requisitos do helper:
- converter campos de data para `Date` válido (ou fallback seguro):
  - `createdAt`
  - `updatedAt` (quando existir)
  - `expiresAt`
  - `syncedAt` (quando existir)
- preservar campos de domínio (`id`, `userId`, `visitId`, `date`, `bed`, `reference`, `note`, `tags`, `syncStatus`)
- não estourar se payload vier com strings ISO (cenário pós JSON.parse)

### 2) Usar helper no fluxo de sync de notas
Arquivo: `src/services/sync/sync-service.ts`

- em `processNoteSyncItem(...)`, substituir uso de payload bruto por payload serializado do helper
- aplicar tanto para write legado (`/users/{uid}/notes`) quanto mirror (`/visits/{visitId}/notes`)

### 3) Testes unitários do helper
Arquivo: `src/services/sync/sync-service.test.ts`

Adicionar testes mínimos:
- converte strings ISO para Date corretamente
- preserva Date válido quando já vem como Date
- aplica fallback seguro para campos ausentes/invalidos sem quebrar
- mantém campos não-data intactos

## Fora de escopo
- mudar política de retry/erro permission-denied neste slice
- implementar sync imediato após save (fica para próximo slice)
- alterar regras Firestore
- refatoração ampla de sync

## Critérios de aceite
- sync de nota não falha por tipo de timestamp no payload
- helper coberto por testes unitários
- validações verdes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

---

## Prompt pronto para colar (nova conversa / subagente)

```markdown
Você está no projeto WardFlow.

Implemente o slice **S14D - Hotfix de serialização de timestamps no sync de notas** com diff mínimo.

Antes de codar, leia:
1) `AGENTS.md`
2) `docs/collab-slices-roadmap.md`
3) `docs/collab-slice14d-note-sync-timestamp-serialization-hotfix-handoff-prompt.md`
4) `src/services/sync/sync-service.ts`
5) `src/services/sync/sync-service.test.ts`

## Escopo obrigatório
1. Criar helper exportado em `sync-service.ts` (ex.: `serializeNoteForFirestore`) que normalize datas de `Note` para write no Firestore.
2. Em `processNoteSyncItem`, usar esse helper no write para `/users/{uid}/notes` e no mirror `/visits/{visitId}/notes`.
3. Adicionar testes unitários do helper em `sync-service.test.ts`.

## Restrições
- NÃO alterar firestore.rules.
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
