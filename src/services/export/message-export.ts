/**
 * WardFlow Message Export Service
 * Serviço de exportação de notas para formato de mensagem
 */

import type { Note } from '@/models/note';

/** Estrutura de wards agrupadas */
export interface WardGroupData {
  ward: string;
  notes: Note[];
}

/** Escopo de exportação por data */
export interface DateScope {
  type: 'date';
  date: string;
  wards: WardGroupData[];
}

/** Escopo de exportação por ala */
export interface WardScope {
  type: 'ward';
  ward: string;
  notes: Note[];
}

/** Escopo de exportação */
export type ExportScope = DateScope | WardScope;

export interface ExportOptions {
  format: 'text' | 'markdown' | 'json';
  includeReference: boolean;
  groupBy: 'date' | 'ward' | 'none';
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'text',
  includeReference: true,
  groupBy: 'date',
};

/**
 * Gera mensagem formatada a partir de um escopo
 *
 * Formato para data:
 * *Pendências*
 *
 * *Ward*
 * - LEITO | nota
 * - LEITO (ref) | nota
 *
 * Formato para ward:
 * *Ward*
 * - LEITO | nota
 */
export function generateMessage(scope: ExportScope): string {
  if (scope.type === 'date') {
    return generateDateMessage(scope);
  }
  return generateWardMessage(scope);
}

/**
 * Gera mensagem para escopo de data
 */
function generateDateMessage(scope: DateScope): string {
  const lines: string[] = [];

  lines.push('*Pendências*');
  lines.push('');

  for (const wardGroup of scope.wards) {
    lines.push(`*${wardGroup.ward}*`);
    for (const note of wardGroup.notes) {
      lines.push(formatNoteLine(note));
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Gera mensagem para escopo de ala
 */
function generateWardMessage(scope: WardScope): string {
  const lines: string[] = [];

  lines.push(`*${scope.ward}*`);
  lines.push('');

  for (const note of scope.notes) {
    lines.push(formatNoteLine(note));
  }

  return lines.join('\n').trim();
}

/**
 * Formata uma linha de nota no formato: - LEITO | nota
 * Inclui referência se existir: - LEITO (ref) | nota
 */
function formatNoteLine(note: Note): string {
  const bed = note.bed;
  const ref = note.reference ? ` (${note.reference})` : '';
  return `- ${bed}${ref} | ${note.note}`;
}

/**
 * Exporta notas para formato de texto
 */
export function exportNotesAsText(notes: Note[], options: ExportOptions = DEFAULT_EXPORT_OPTIONS): string {
  if (notes.length === 0) {
    return '';
  }

  const lines: string[] = [];

  if (options.groupBy === 'date') {
    const grouped = groupByDate(notes);
    for (const [date, dateNotes] of grouped) {
      lines.push(`📅 ${formatDate(date)}`);
      lines.push('');
      for (const note of dateNotes) {
        lines.push(formatNoteEntry(note, options));
      }
      lines.push('');
    }
  } else if (options.groupBy === 'ward') {
    const grouped = groupByWard(notes);
    for (const [ward, wardNotes] of grouped) {
      lines.push(`🏥 ${ward}`);
      lines.push('');
      for (const note of wardNotes) {
        lines.push(formatNoteEntry(note, options));
      }
      lines.push('');
    }
  } else {
    for (const note of notes) {
      lines.push(formatNoteEntry(note, options));
    }
  }

  return lines.join('\n').trim();
}

/**
 * Exporta notas para formato Markdown
 */
export function exportNotesAsMarkdown(notes: Note[], options: ExportOptions = DEFAULT_EXPORT_OPTIONS): string {
  if (notes.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('# Notas do Round');
  lines.push('');

  if (options.groupBy === 'date') {
    const grouped = groupByDate(notes);
    for (const [date, dateNotes] of grouped) {
      lines.push(`## ${formatDate(date)}`);
      lines.push('');
      for (const note of dateNotes) {
        lines.push(formatNoteEntryMarkdown(note, options));
      }
    }
  } else if (options.groupBy === 'ward') {
    const grouped = groupByWard(notes);
    for (const [ward, wardNotes] of grouped) {
      lines.push(`## ${ward}`);
      lines.push('');
      for (const note of wardNotes) {
        lines.push(formatNoteEntryMarkdown(note, options));
      }
    }
  } else {
    for (const note of notes) {
      lines.push(formatNoteEntryMarkdown(note, options));
    }
  }

  return lines.join('\n').trim();
}

/**
 * Formata uma entrada de nota (texto simples)
 */
function formatNoteEntry(note: Note, options: ExportOptions): string {
  const header = `Leito ${note.bed}`;
  const ref = options.includeReference && note.reference ? ` (${note.reference})` : '';
  return `${header}${ref}: ${note.note}`;
}

/**
 * Formata uma entrada de nota (Markdown)
 */
function formatNoteEntryMarkdown(note: Note, options: ExportOptions): string {
  const header = `### Leito ${note.bed}`;
  const ref = options.includeReference && note.reference ? ` _(${note.reference})_` : '';
  return `${header}${ref}\n\n${note.note}\n`;
}

/**
 * Agrupa notas por data
 */
function groupByDate(notes: Note[]): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>();
  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  for (const note of sorted) {
    const existing = grouped.get(note.date) ?? [];
    existing.push(note);
    grouped.set(note.date, existing);
  }

  return grouped;
}

/**
 * Agrupa notas por ala
 */
function groupByWard(notes: Note[]): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>();
  const sorted = [...notes].sort((a, b) => a.ward.localeCompare(b.ward));

  for (const note of sorted) {
    const existing = grouped.get(note.ward) ?? [];
    existing.push(note);
    grouped.set(note.ward, existing);
  }

  return grouped;
}

/**
 * Formata data para exibição
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Copia texto para a área de transferência
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para browsers mais antigos
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}
