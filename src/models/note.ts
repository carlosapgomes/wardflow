/**
 * VisitaMed Note Model
 * Modelo para notas transitórias de rounds clínicos
 */

export interface Note {
  /** ID único da nota (UUID) */
  id: string;

  /** ID do usuário que criou a nota */
  userId: string;

  /** ID da visita à qual a nota pertence */
  visitId: string;

  /** Data do atendimento (YYYY-MM-DD) */
  date: string;

  /** Ala/Unidade (ex: "UTI", "Enfermaria A") */
  ward: string;

  /** Tags derivadas do ward (máx 10) */
  tags?: string[];

  /** Leito (ex: "01", "02A") */
  bed: string;

  /** Referência opcional (ex: nome do paciente, registro) */
  reference?: string;

  /** Conteúdo da nota */
  note: string;

  /** Timestamp de criação */
  createdAt: Date;

  /** Timestamp de atualização */
  updatedAt?: Date;

  /** Timestamp de expiração (padrão: 14 dias) */
  expiresAt: Date;

  /** Status de sincronização */
  syncStatus: SyncStatus;

  /** Timestamp da última sincronização */
  syncedAt?: Date;
}

export type SyncStatus = 'pending' | 'synced' | 'failed';

/**
 * Constantes relacionadas a notas
 */
export const NOTE_CONSTANTS = {
  /** Dias até expiração padrão */
  EXPIRATION_DAYS: 14,

  /** Tamanho máximo do campo note */
  MAX_NOTE_LENGTH: 2000,

  /** Tamanho máximo do campo reference */
  MAX_REFERENCE_LENGTH: 100,

  /** Máximo de tags por nota */
  MAX_TAGS_PER_NOTE: 10,
} as const;

/**
 * Cria uma nova nota com valores padrão
 */
export function createNote(partial: Partial<Note>): Note {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + NOTE_CONSTANTS.EXPIRATION_DAYS);

  return {
    id: crypto.randomUUID(),
    userId: '',
    visitId: '',
    date: now.toISOString().split('T')[0] ?? '',
    ward: '',
    bed: '',
    tags: [],
    reference: undefined,
    note: '',
    createdAt: now,
    expiresAt,
    syncStatus: 'pending',
    ...partial,
  };
}
