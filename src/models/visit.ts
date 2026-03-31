/**
 * VisitaMed Visit Model
 * Modelo para visitas (conjuntos de notas de uma data)
 */

export interface Visit {
  /** ID único da visita (UUID) */
  id: string;

  /** ID do usuário que criou a visita */
  userId: string;

  /** Nome da visita */
  name: string;

  /** Data da visita (YYYY-MM-DD) */
  date: string;

  /** Modo da visita: privada ou em grupo */
  mode: 'private' | 'group';

  /** Timestamp de criação */
  createdAt: Date;

  /** Timestamp de atualização */
  updatedAt?: Date;
}

/**
 * Constantes relacionadas a visitas
 */
export const VISIT_CONSTANTS = {
  /** Tamanho máximo do nome */
  MAX_NAME_LENGTH: 100,
} as const;

/**
 * Gera nome padrão para visita privada
 * Formato: "<prefixo> <dd-mm-aaaa> privada" ou "Visita dd-mm-aaaa privada"
 */
export function generatePrivateVisitName(prefix?: string): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year)}`;

  if (prefix?.trim()) {
    return `${prefix.trim()} ${dateStr} privada`;
  }

  return `Visita ${dateStr} privada`;
}

/**
 * Gera data atual no formato YYYY-MM-DD
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

/**
 * Cria uma nova visita com valores padrão
 */
export function createVisit(partial: Partial<Visit>): Visit {
  const now = new Date();

  return {
    id: crypto.randomUUID(),
    userId: '',
    name: '',
    date: getCurrentDate(),
    mode: 'private',
    createdAt: now,
    ...partial,
  };
}
