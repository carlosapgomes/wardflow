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
| S7B | TODO | UI múltiplas tags + remover-tag-ou-nota | (gerar) |
| S8A | TODO | Agrupamento dashboard por tags (TDD) | (gerar) |
| S8B | TODO | Componente de grupo por tag + actions | (gerar) |
| S9A | TODO | Exportação com mesmo critério do dashboard | (gerar) |
| S10 | TODO | Hardening final + limpeza | (gerar) |

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

Estado atual validado localmente: typecheck/lint/test verdes (217 testes).

---

## Débitos conhecidos

- Owner-only para criar/revogar convite ainda precisa ser fechado na camada remota (rules/functions).
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
