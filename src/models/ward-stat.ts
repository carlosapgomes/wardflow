/**
 * VisitaMed Ward Stat Model
 * Modelo para rastrear uso de alas no dispositivo local
 */

export interface WardStat {
  /** ID único (userId + wardKey) */
  id: string;

  /** ID do usuário */
  userId: string;

  /** Chave canônica da ala (trim + collapse spaces + UPPERCASE) */
  wardKey: string;

  /** Label exibido ao usuário (trim + collapse spaces, case preservado) */
  wardLabel: string;

  /** Contador de usos */
  usageCount: number;

  /** Timestamp do último uso */
  lastUsedAt: Date;

  /** Timestamp de atualização */
  updatedAt: Date;
}

/**
 * Cria um ID único para ward stat
 */
export function createWardStatId(userId: string, wardKey: string): string {
  return `${userId}:${wardKey}`;
}

/**
 * Normaliza ala para key canônica
 * trim + collapse espaços internos + UPPERCASE
 */
export function normalizeWardKey(ward: string): string {
  return ward
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Normaliza ala para label de exibição
 * trim + collapse espaços internos, preservando case
 */
export function normalizeWardLabel(ward: string): string {
  return ward.trim().replace(/\s+/g, ' ');
}

/**
 * Cria uma nova WardStat
 */
export function createWardStat(
  userId: string,
  ward: string
): WardStat {
  const wardKey = normalizeWardKey(ward);
  const wardLabel = normalizeWardLabel(ward);
  const now = new Date();

  return {
    id: createWardStatId(userId, wardKey),
    userId,
    wardKey,
    wardLabel,
    usageCount: 1,
    lastUsedAt: now,
    updatedAt: now,
  };
}
