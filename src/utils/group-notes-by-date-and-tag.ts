/**
 * Group Notes by Date and Tag Utility
 * Função pura para agrupar notas por data e tag
 *
 * Regras:
 * - agrupar por data + tag
 * - nota com múltiplas tags aparece em múltiplos grupos (fan-out)
 * - ordenação: data desc, tag asc, notas createdAt desc
 * - evitar duplicata da mesma nota no mesmo grupo
 */

import { normalizeTagList } from '@/models/tag';
import type { Note } from '@/models/note';

/**
 * Estrutura de notas agrupadas por data e tag
 */
export interface GroupedNotesByTag {
  date: string;
  tags: {
    tag: string;
    notes: Note[];
  }[];
}

/**
 * Agrupa notas por data e, dentro de cada data, por tag.
 *
 * Ordenação:
 * - Datas: mais recentes primeiro (desc)
 * - Tags: ordem alfabética crescente (asc)
 * - Notas dentro de cada tag: mais recentes primeiro (por createdAt desc)
 *
 * Regras de negócio:
 * - Nota com múltiplas tags aparece em todos os grupos de tag (fan-out)
 * - Notas sem tags válidas não entram em grupos
 * - Tags repetidas na mesma nota são dedupadas
 *
 * @param notes Lista de notas a agrupar
 * @returns Array de grupos de notas por data e tag
 */
export function groupNotesByDateAndTag(notes: Note[]): GroupedNotesByTag[] {
  if (notes.length === 0) {
    return [];
  }

  // Agrupar por data
  const byDate = new Map<string, Note[]>();

  for (const note of notes) {
    const existing = byDate.get(note.date) ?? [];
    existing.push(note);
    byDate.set(note.date, existing);
  }

  const result: GroupedNotesByTag[] = [];

  // Para cada data, agrupar por tag
  for (const [date, dateNotes] of byDate) {
    const byTag = new Map<string, Note[]>();

    for (const note of dateNotes) {
      // Normalizar e dedupar tags da nota
      const uniqueTags = [...new Set(normalizeTagList(note.tags ?? []))];

      // Nota sem tags válidas não participa do agrupamento
      if (uniqueTags.length === 0) {
        continue;
      }

      // Para cada tag efetiva, adicionar a nota ao grupo (fan-out)

      for (const tag of uniqueTags) {
        const existing = byTag.get(tag) ?? [];
        // Evitar duplicar a mesma nota no mesmo grupo
        if (!existing.some(n => n.id === note.id)) {
          existing.push(note);
        }
        byTag.set(tag, existing);
      }
    }

    // Ordenar tags alfabeticamente (asc) e notas por createdAt (desc)
    const sortedTags = Array.from(byTag.entries())
      .sort((a, b) => a[0].localeCompare(b[0])) // asc
      .map(([tag, tagNotes]) => ({
        tag,
        notes: [...tagNotes].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() // desc
        ),
      }));

    if (sortedTags.length > 0) {
      result.push({ date, tags: sortedTags });
    }
  }

  // Ordenar datas: mais recentes primeiro (desc)
  result.sort((a, b) => b.date.localeCompare(a.date));

  return result;
}
