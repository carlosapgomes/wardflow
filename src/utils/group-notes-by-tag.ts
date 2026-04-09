/**
 * Group Notes by Tag Utility
 * Função pura para agrupar notas apenas por tag.
 *
 * Regras:
 * - agrupar somente por tag (sem particionar por data)
 * - nota com múltiplas tags aparece em múltiplos grupos (fan-out)
 * - ordenação: tag asc, notas por leito asc
 * - evitar duplicata da mesma nota no mesmo grupo
 */

import { normalizeTagList } from '@/models/tag';
import type { Note } from '@/models/note';

/** Estrutura de notas agrupadas por tag */
export interface GroupedNotesByTag {
  tag: string;
  notes: Note[];
}

/**
 * Agrupa notas por tag.
 *
 * Regras de negócio:
 * - Nota com múltiplas tags aparece em todos os grupos de tag (fan-out)
 * - Notas sem tags válidas não entram em grupos
 * - Tags repetidas na mesma nota são dedupadas
 */
export function groupNotesByTag(notes: Note[]): GroupedNotesByTag[] {
  if (notes.length === 0) {
    return [];
  }

  const byTag = new Map<string, Note[]>();

  for (const note of notes) {
    const uniqueTags = [...new Set(normalizeTagList(note.tags ?? []))];

    if (uniqueTags.length === 0) {
      continue;
    }

    for (const tag of uniqueTags) {
      const existing = byTag.get(tag) ?? [];
      if (!existing.some((n) => n.id === note.id)) {
        existing.push(note);
      }
      byTag.set(tag, existing);
    }
  }

  return Array.from(byTag.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tag, tagNotes]) => ({
      tag,
      notes: [...tagNotes].sort((a, b) => a.bed.localeCompare(b.bed)),
    }));
}
