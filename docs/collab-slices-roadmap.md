# Roadmap de Slices — Colaboração (fonte única)

> **Arquivo oficial único** para estado, histórico e próximos passos do épico.
> Última atualização: 2026-04-01
> Branch: `feature/collab-s1-visits-foundation`

## Regras operacionais

- Trabalhar em micro-slices (até ~6 arquivos alterados, 1 responsabilidade central).
- Ao final de cada slice, rodar:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
- Só iniciar o próximo slice quando o anterior estiver `DONE`.

---

## Decisões de produto (congeladas)

1. `paciente = nota` (sem entidade paciente separada).
2. Visita tem data fixa.
3. Duplicar visita copia tudo e cria visita independente.
4. Papéis: `owner`, `editor`, `viewer`.
5. Só `owner` convida/remove membros.
6. Remoção = perda total de acesso à visita.
7. Convite por link/token, múltiplo uso, expira em 24h, revogável.
8. Login obrigatório para aceitar convite.
9. Offline obrigatório; online atualiza imediato.
10. Conflito delete vs update: `delete` vence.
11. Se removido e com alterações offline: descartar ao reconectar (fase sync).
12. Dashboard lista visitas primeiro.
13. `viewer` pode ler/copiar/compartilhar/exportar; não edita nota/tag.
14. `editor` edita/exclui notas; não gerencia membros/convites.
15. `editor/viewer` podem duplicar visita para privada própria.
16. Tags globais do usuário com equivalência canônica.
17. Equivalência de tag: trim + collapse spaces + uppercase + sem acento.
18. Máximo de 10 tags por nota.
19. Nota com múltiplas tags aparece em múltiplos grupos.
20. Remover tag desvincula; se última tag, remove nota.
21. Sem migração legada (reset permitido).
22. Expiração de notas (14 dias) permanece.

---

## Backlog de slices

| Slice | Status | Objetivo | Prompt |
|---|---|---|---|
| S0 | TODO | Reset técnico (baseline) | (sob demanda) |
| S1 | DONE | Fundação de visitas privadas (`visitId`) | `prompts/collab-slice1-visits-foundation-handoff-prompt.md` |
| S2A | DONE | Modelo `visit-member` + permissões puras | `prompts/collab-slice2a-collab-model-permissions-handoff-prompt.md` |
| S2B | DONE | Persistência local de membros (Dexie) | `prompts/collab-slice2b-members-local-persistence-handoff-prompt.md` |
| S2C1 | DONE | Permissões no dashboard (viewer sem FAB/delete) | `prompts/collab-slice2c1-dashboard-permissions-handoff-prompt.md` |
| S2C2 | DONE | Guard no editor de nota para viewer | `prompts/collab-slice2c2-note-editor-guard-handoff-prompt.md` |
| S3A | DONE | Modelo local de convites + helpers | `prompts/collab-slice3a-invite-model-local-handoff-prompt.md` |
| S3B1 | DONE | Persistência local de convites + testes de serviço | `prompts/collab-slice3b1-invite-local-persistence-handoff-prompt.md` |
| S3B2 | DONE | Aceitar convite por token + rota/view | `prompts/collab-slice3b2-accept-invite-by-token-handoff-prompt.md` |
| S4A | DONE | Remoção de membro owner-only (serviço + testes) | `prompts/collab-slice4a-owner-remove-member-handoff-prompt.md` |
| S4B | DONE | UX de revogação (feedback/fluxo) | `docs/collab-slice4b-revocation-ux-handoff-prompt.md` |
| S5A | DONE | Firestore schema colaborativo + rules ACL | `docs/collab-slice5a-firestore-acl-baseline-handoff-prompt.md` |
| S5B | DONE | Sync push/pull por visita | `docs/collab-slice5b-visit-sync-push-pull-handoff-prompt.md` |
| S5C | DONE | Conflitos offline (`delete > update`) + descarte pós-revogação | `docs/collab-slice5c-delete-wins-revocation-discard-handoff-prompt.md` |
| S5D | DONE | Realtime apenas da visita aberta | `docs/collab-slice5d-active-visit-realtime-handoff-prompt.md` |
| S6A | DONE | Duplicar visita (nova data, novo owner) | `docs/collab-slice6a-duplicate-visit-private-owner-handoff-prompt.md` |
| S7A | DONE | Base de tags (`ward` -> `tags[]`) | `docs/collab-slice7a-tags-foundation-handoff-prompt.md` |
| S7B | DONE | UI múltiplas tags + remover-tag-ou-nota | `docs/collab-slice7b-tags-ui-remove-tag-or-note-handoff-prompt.md` |
| S8A | DONE | Agrupamento dashboard por tags (TDD) | `docs/collab-slice8a-dashboard-group-by-tags-tdd-handoff-prompt.md` |
| S8B | DONE | Componente de grupo por tag + actions | `docs/collab-slice8b-tag-group-component-actions-handoff-prompt.md` |
| S9A | DONE | Exportação com mesmo critério do dashboard | `docs/collab-slice9a-export-by-tags-aligned-dashboard-handoff-prompt.md` |
| S10 | DONE | Hardening final + limpeza | `docs/collab-slice10-hardening-final-cleanup-handoff-prompt.md` |
| S11A | DONE | Backend baseline: endpoint autenticado para aceitar convite | `docs/collab-slice11a-invite-accept-endpoint-baseline-handoff-prompt.md` |
| S11B | DONE | Fonte remota de convites (create/revoke/list em Firestore) | `docs/collab-slice11b-remote-invites-firestore-handoff-prompt.md` |
| S11C | DONE | Aceite real por token no backend (transação + statuses) | `docs/collab-slice11c-invite-accept-backend-transaction-handoff-prompt.md` |
| S11D | TODO | Frontend troca aceite local por endpoint remoto | (gerar) |
| S11E | TODO | Hardening do fluxo de convite remoto (hash/rate-limit/auditoria) | (gerar) |

---

## Histórico resumido (com commits)

- S1: `fe036c0`
- S2A: `a93d360`
- S2B: `0088ba0`
- S2C1: `bfdeb0b`
- S2C2: `2313c6b`
- S3A: `3f64a98`
- S3B1: `d12546b`
- S3B2: `1e644ca`
- Fix redirect pós-login centralizado: `b00b5ec`
- S4A: `0b27603`
- S4B: `04a488e`
- S5A: `8ab17a7`
- S5B: `02339f1`
- S5C: `8ba4d94`
- S5D: `1e82d60`
- S6A: `c977b27`
- S7A: `fcd5be7`
- S7B: `c3676c2`
- S8A: `a2b387f`
- S8B: `52646e6`
- S9A: `b26db22`
- S10: `e3461dc`
- S11A: `8332408`
- S11B: `218af6d`
- S11C: `227a0ed`

Estado atual validado localmente: typecheck/lint/test verdes (229 testes).

---

## Débitos conhecidos

- Aceite de convite está parcialmente migrado: backend (S11C) já processa token; frontend ainda precisa migrar do fluxo local para endpoint remoto em S11D.
- Hardening de segurança do fluxo remoto (hash/rate-limit/auditoria) pendente para S11E.
- Preservação robusta de deep link em cenários de auth edge-case pode ser refinada em hardening.

---

## Template de handoff por slice

```md
## HANDOFF — <SLICE_ID>

### Resumo
- O que foi implementado:
- O que ficou fora de escopo:

### Arquivos alterados
- path/a.ts: <mudança>
- path/b.ts: <mudança>

### Testes
- Novos testes:
- Testes ajustados:
- Resultado:
  - npm run typecheck
  - npm run lint
  - npm test

### Decisões tomadas
- <decisão 1>
- <decisão 2>

### Débitos / riscos
- <item 1>
- <item 2>

### Próximo slice sugerido
- <slice>
- prompt: <arquivo>
```
