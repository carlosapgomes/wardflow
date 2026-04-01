/**
 * Tag Model - Helpers puros para normalização de tags
 *
 * Equivalência canônica: trim + collapse spaces + uppercase + sem acento
 */

const MAX_TAGS_DEFAULT = 10;

/**
 * Remove acentos de uma string
 */
function removeAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza um valor de tag individual
 * - trim
 * - collapse de espaços internos
 * - remove acentos
 * - uppercase
 */
export function normalizeTagValue(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return removeAccents(input)
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Normaliza uma lista de tags
 * - aplica normalização por item
 * - remove vazios
 * - dedup por valor canônico
 * - limita ao máximo (default 10)
 */
export function normalizeTagList(tags: unknown, max = MAX_TAGS_DEFAULT): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const normalized = tags
    .map((t) => normalizeTagValue(String(t ?? '')))
    .filter((t) => t.length > 0);

  // Dedup por valor canônico (já normalizado)
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const tag of normalized) {
    if (!seen.has(tag)) {
      seen.add(tag);
      unique.push(tag);
    }
  }

  // Limita ao máximo
  return unique.slice(0, max);
}

