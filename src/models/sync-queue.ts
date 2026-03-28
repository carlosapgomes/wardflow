/**
 * VisitaMed Sync Queue Model
 * Fila de sincronização para operações offline
 */

export interface SyncQueueItem {
  /** ID único do item na fila */
  id: string;

  /** ID do usuário dono do item */
  userId: string;

  /** Tipo de operação */
  operation: SyncOperation;

  /** Tipo de entidade */
  entityType: 'note' | 'settings' | 'wardStat';

  /** ID da entidade */
  entityId: string;

  /** Dados da entidade (serializados) */
  payload: string;

  /** Timestamp de criação do item na fila */
  createdAt: Date;

  /** Número de tentativas de sincronização */
  retryCount: number;

  /** Timestamp da última tentativa */
  lastAttemptAt?: Date;

  /** Mensagem de erro (se houver) */
  error?: string;
}

export type SyncOperation = 'create' | 'update' | 'delete' | 'increment';

/**
 * Constantes da fila de sincronização
 */
export const SYNC_QUEUE_CONSTANTS = {
  /** Número máximo de tentativas */
  MAX_RETRIES: 5,

  /** Intervalo entre tentativas (ms) */
  RETRY_DELAY_MS: 5000,

  /** Delay exponencial máximo (ms) */
  MAX_RETRY_DELAY_MS: 60000,
} as const;

/**
 * Cria um novo item na fila de sincronização
 */
export function createSyncQueueItem(
  userId: string,
  operation: SyncOperation,
  entityType: SyncQueueItem['entityType'],
  entityId: string,
  payload: unknown
): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    userId,
    operation,
    entityType,
    entityId,
    payload: JSON.stringify(payload),
    createdAt: new Date(),
    retryCount: 0,
  };
}
