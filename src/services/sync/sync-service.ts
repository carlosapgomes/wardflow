/**
 * VisitaMed Sync Service
 * Serviço de sincronização entre IndexedDB e Firestore
 *
 * TODO: Implementar sincronização completa na próxima fase
 */

import { db } from '@/services/db/dexie-db';
import type { Note } from '@/models/note';
import type { SyncQueueItem } from '@/models/sync-queue';
import type { WardStat } from '@/models/ward-stat';
import { getFirebaseFirestore } from '@/services/auth/firebase';
import { getAuthState } from '@/services/auth/auth-service';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  increment,
  type DocumentData,
  type Firestore,
  type UpdateData,
} from 'firebase/firestore';
import { SYNC_QUEUE_CONSTANTS } from '@/models/sync-queue';

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  error: string | null;
}

type SyncStatusCallback = (status: SyncStatus) => void;

let currentStatus: SyncStatus = {
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  error: null,
};

const subscribers = new Set<SyncStatusCallback>();

const SYNC_INTERVAL_MS = 60000;
let isSyncInitialized = false;
let onlineHandler: (() => void) | null = null;
let periodicSyncIntervalId: number | null = null;

/**
 * Obtém o status atual de sincronização
 */
export function getSyncStatus(): SyncStatus {
  return { ...currentStatus };
}

/**
 * Subscribe para mudanças de status de sincronização
 */
export function subscribeToSync(callback: SyncStatusCallback): () => void {
  subscribers.add(callback);
  callback(currentStatus);
  return () => subscribers.delete(callback);
}

/**
 * Inicializa orquestração automática de sync
 */
export function initializeSync(): void {
  if (isSyncInitialized) {
    return;
  }

  isSyncInitialized = true;

  // Mantém contador consistente ao iniciar app
  void updatePendingCount();

  if (typeof window !== 'undefined') {
    onlineHandler = () => {
      void syncIfAuthenticated();
    };

    window.addEventListener('online', onlineHandler);

    periodicSyncIntervalId = window.setInterval(() => {
      void syncIfAuthenticated();
    }, SYNC_INTERVAL_MS);
  }
}

/**
 * Cleanup da orquestração automática de sync
 */
export function cleanupSync(): void {
  if (typeof window !== 'undefined' && onlineHandler) {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }

  if (typeof window !== 'undefined' && periodicSyncIntervalId !== null) {
    window.clearInterval(periodicSyncIntervalId);
    periodicSyncIntervalId = null;
  }

  isSyncInitialized = false;
}

/**
 * Adiciona uma nota à fila de sincronização
 */
export async function queueNoteForSync(
  operation: 'create' | 'update' | 'delete',
  note: Note
): Promise<void> {
  const { createSyncQueueItem } = await import('@/models/sync-queue');
  const item = createSyncQueueItem(note.userId, operation, 'note', note.id, note);
  await db.syncQueue.add(item);
  await updatePendingCount();
}

/**
 * Executa a sincronização pendente
 *
 * TODO: Implementar lógica completa de sync com Firestore
 */
export async function syncNow(): Promise<void> {
  const { user, loading } = getAuthState();

  if (loading || !user) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  const firestore = getFirebaseFirestore();

  if (!firestore) {
    console.warn('[VisitaMed] Firestore não configurado');
    return;
  }

  if (currentStatus.isSyncing) {
    return;
  }

  currentStatus = { ...currentStatus, isSyncing: true, error: null };
  notifySubscribers();

  let syncError: string | null = null;

  try {
    const pendingItems = await db.syncQueue
      .where('userId')
      .equals(user.uid)
      .sortBy('createdAt');

    for (const item of pendingItems) {
      try {
        await processSyncItem(item, firestore);
        await db.syncQueue.delete(item.id);
      } catch (error) {
        await handleSyncError(item, error);
      }
    }
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Erro na sincronização';
  }

  const pendingCount = await db.syncQueue.count();

  currentStatus = {
    ...currentStatus,
    isSyncing: false,
    pendingCount,
    lastSyncAt: syncError ? currentStatus.lastSyncAt : new Date(),
    error: syncError,
  };

  notifySubscribers();
}

/**
 * Processa um item da fila de sincronização
 */
async function processSyncItem(item: SyncQueueItem, firestore: Firestore): Promise<void> {
  // Processa notas
  if (item.entityType === 'note') {
    await processNoteSyncItem(item, firestore);
    return;
  }

  // Processa wardStats
  if (item.entityType === 'wardStat') {
    await processWardStatSyncItem(item, firestore);
    return;
  }

  throw new Error(`Tipo de entidade não suportado: ${item.entityType}`);
}

/**
 * Processa sync de nota
 */
async function processNoteSyncItem(item: SyncQueueItem, firestore: Firestore): Promise<void> {
  let notePayload: Note;

  try {
    notePayload = JSON.parse(item.payload) as Note;
  } catch {
    throw new Error('Payload inválido na fila de sincronização');
  }

  const noteData = notePayload as unknown as DocumentData;
  const noteRef = doc(firestore, 'users', item.userId, 'notes', item.entityId);

  if (item.operation === 'create') {
    await setDoc(noteRef, noteData);
  }

  if (item.operation === 'update') {
    try {
      await updateDoc(noteRef, noteData as UpdateData<DocumentData>);
    } catch {
      await setDoc(noteRef, noteData, { merge: true });
    }
  }

  if (item.operation === 'delete') {
    await deleteDoc(noteRef);
  }

  if (item.operation !== 'delete') {
    await db.notes.update(item.entityId, {
      syncStatus: 'synced',
      syncedAt: new Date(),
    });
  }
}

/**
 * Payload do sync de wardStat
 */
interface WardStatSyncPayload {
  wardKey: string;
  wardLabel: string;
  usageCount: number;
  lastUsedAt: string;
  updatedAt: string;
}

/**
 * Processa sync de wardStat com incremento
 * Usa increment() do Firestore para modelo aditivo
 */
async function processWardStatSyncItem(item: SyncQueueItem, firestore: Firestore): Promise<void> {
  let payload: WardStatSyncPayload;

  try {
    payload = JSON.parse(item.payload) as WardStatSyncPayload;
  } catch {
    throw new Error('Payload inválido na fila de sincronização de wardStat');
  }

  const wardRef = doc(firestore, 'users', item.userId, 'wardStats', item.entityId);
  const now = new Date();

  // Dados que sempre devem ser atualizados (não incrementais)
  const updateData = {
    wardKey: payload.wardKey,
    wardLabel: payload.wardLabel,
    lastUsedAt: payload.lastUsedAt,
    updatedAt: now.toISOString(),
    userId: item.userId,
  };

  // Tenta usar updateDoc com increment primeiro
  try {
    await updateDoc(wardRef, {
      ...updateData,
      usageCount: increment(1),
    } as UpdateData<DocumentData>);
  } catch {
    // Se documento não existe, usa setDoc com merge
    await setDoc(wardRef, {
      ...updateData,
      usageCount: increment(1),
    }, { merge: true });
  }
}

/**
 * Trata erros de sincronização
 */
async function handleSyncError(item: SyncQueueItem, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Erro desconhecido';
  const retryCount = item.retryCount + 1;
  const lastAttemptAt = new Date();

  if (retryCount >= SYNC_QUEUE_CONSTANTS.MAX_RETRIES) {
    console.error('[VisitaMed] Item excedeu máximo de tentativas:', item.id);
    await db.syncQueue.update(item.id, {
      retryCount,
      error: message,
      lastAttemptAt,
    });

    // Marca sincronização falhou apenas para notas (não para wardStats)
    if (item.entityType === 'note') {
      await db.notes.update(item.entityId, {
        syncStatus: 'failed',
      });
    }

    await db.syncQueue.delete(item.id);
    return;
  }

  await db.syncQueue.update(item.id, {
    retryCount,
    lastAttemptAt,
    error: message,
  });
}

/**
 * Tenta sincronizar quando há usuário autenticado
 */
async function syncIfAuthenticated(): Promise<void> {
  const { user, loading } = getAuthState();

  if (loading || !user) {
    return;
  }

  await syncNow();
  await pullRemoteNotes();
}

/**
 * Resolve conflito entre nota local e remota usando política LWW.
 *
 * Regras:
 * - Se não existe local -> usar remote
 * - Se local.syncStatus é 'pending' ou 'failed' -> manter local
 * - Caso contrário, comparar timestamps (updatedAt > createdAt como fallback)
 *   - remote mais novo -> usar remote
 *   - local mais novo ou empate -> manter local
 */
export function resolveNoteConflict(local: Note | undefined, remote: Note): Note {
  // Caso 1: não existe local - usar remoto
  if (!local) {
    return remote;
  }

  // Caso 2: local com operação pendente ou falhou - preservar local
  if (local.syncStatus === 'pending' || local.syncStatus === 'failed') {
    return local;
  }

  // Caso 3: ambos synced - comparar timestamps (LWW)
  const localVersion = local.updatedAt ?? local.createdAt;
  const remoteVersion = remote.updatedAt ?? remote.createdAt;

  if (remoteVersion > localVersion) {
    return remote;
  }

  // Empate ou local mais novo - manter local
  return local;
}

/**
 * Pull inicial de notas remotas do Firestore para IndexedDB
 * Hidrata dados locais no login usando notas já existentes na nuvem
 */
export async function pullRemoteNotes(): Promise<void> {
  const { user, loading } = getAuthState();

  if (loading || !user) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  const firestore = getFirebaseFirestore();

  if (!firestore) {
    console.warn('[VisitaMed] Firestore não configurado');
    return;
  }

  const shouldManageSyncState = !currentStatus.isSyncing;
  if (shouldManageSyncState) {
    currentStatus = { ...currentStatus, isSyncing: true };
    notifySubscribers();
  }

  let pullError: string | null = null;

  try {
    const notesCollection = collection(firestore, 'users', user.uid, 'notes');
    const notesSnapshot = await getDocs(notesCollection);

    if (notesSnapshot.empty) {
      return;
    }

    const notesToUpsert: Note[] = [];

    for (const docSnap of notesSnapshot.docs) {
      const data = docSnap.data() as FirestoreNoteData;
      const remoteNote = convertFirestoreNoteToLocal(docSnap.id, data, user.uid);

      // Buscar nota local existente
      const localNote = await db.notes.get(docSnap.id);

      // Aplicar política de resolução de conflito
      const resolvedNote = resolveNoteConflict(localNote, remoteNote);

      // Log de debug apenas quando há conflito real
      if (localNote && localNote.syncStatus !== 'pending' && localNote.syncStatus !== 'failed') {
        const localVersion = localNote.updatedAt ?? localNote.createdAt;
        const remoteVersion = remoteNote.updatedAt ?? remoteNote.createdAt;
        if (remoteVersion > localVersion) {
          console.debug(`[VisitaMed] Conflito resolvido (remote wins): ${docSnap.id}`);
        } else if (localVersion > remoteVersion) {
          console.debug(`[VisitaMed] Conflito resolvido (local wins): ${docSnap.id}`);
        }
      }

      notesToUpsert.push(resolvedNote);
    }

    // Upsert into IndexedDB com notas resolvidas
    await db.notes.bulkPut(notesToUpsert);

    // Reconciliação: remover localmente notas órfãs (deletadas remotamente)
    // Só remove notas com syncStatus 'synced' para não perder alterações locais pendentes
    const remoteIds = new Set(notesToUpsert.map((n) => n.id));
    const localSyncedNotes = await db.notes
      .where({ userId: user.uid, syncStatus: 'synced' })
      .toArray();

    const orphanedIds: string[] = [];
    for (const localNote of localSyncedNotes) {
      if (!remoteIds.has(localNote.id)) {
        orphanedIds.push(localNote.id);
      }
    }

    if (orphanedIds.length > 0) {
      await db.notes.bulkDelete(orphanedIds);
      console.log(`[VisitaMed] ${String(orphanedIds.length)} notas órfãs removidas localmente`);
    }

    console.log(`[VisitaMed] Pull concluído: ${String(notesToUpsert.length)} notas importadas`);
  } catch (error) {
    pullError = error instanceof Error ? error.message : 'Erro no pull de notas remotas';
    console.error('[VisitaMed] Erro no pull de notas remotas:', error);
  } finally {
    if (shouldManageSyncState) {
      currentStatus = {
        ...currentStatus,
        isSyncing: false,
        lastSyncAt: pullError ? currentStatus.lastSyncAt : new Date(),
        error: pullError ?? currentStatus.error,
      };
      notifySubscribers();
    }
  }
}

/**
 * Interface para dados de nota vindos do Firestore
 * Usa unknown para permitir qualquer formato de timestamp
 */
interface FirestoreNoteData {
  date: string | null;
  ward: string | null;
  bed: string | null;
  reference?: string;
  note: string | null;
  createdAt: unknown;
  updatedAt?: unknown;
  expiresAt: unknown;
}

/**
 * Converte timestamp do Firestore para Date JavaScript
 * Trata diferentes formatos: Timestamp, string, número ou Date
 */
function convertTimestampToDate(value: unknown): Date | undefined {
  if (!value) {
    return undefined;
  }

  // Firebase Timestamp (tem método toDate)
  if (typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  // String ISO
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  // Número (unix timestamp em milissegundos)
  if (typeof value === 'number') {
    return new Date(value);
  }

  // Já é Date
  if (value instanceof Date) {
    return value;
  }

  return undefined;
}

/**
 * Converte documento do Firestore para modelo local Note
 */
function convertFirestoreNoteToLocal(
  id: string,
  data: FirestoreNoteData,
  userId: string
): Note {
  const createdAt = convertTimestampToDate(data.createdAt);
  const updatedAt = convertTimestampToDate(data.updatedAt);
  const expiresAt = convertTimestampToDate(data.expiresAt);

  if (!createdAt || !expiresAt) {
    console.warn(`[VisitaMed] Dados de nota inválidos (ID: ${id}), usando valores padrão`);
  }

  return {
    id,
    userId,
    date: data.date ?? '',
    ward: data.ward ?? '',
    bed: data.bed ?? '',
    reference: data.reference,
    note: data.note ?? '',
    createdAt: createdAt ?? new Date(),
    updatedAt,
    expiresAt: expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000), // padrão: 24h
    syncStatus: 'synced',
    syncedAt: new Date(),
  };
}

/**
 * Atualiza contador de itens pendentes
 */
async function updatePendingCount(): Promise<void> {
  const count = await db.syncQueue.count();
  currentStatus = { ...currentStatus, pendingCount: count };
  notifySubscribers();
}

/**
 * Notifica subscribers
 */
function notifySubscribers(): void {
  for (const callback of subscribers) {
    callback(currentStatus);
  }
}

// ============================================================================
// Ward Stats - Pull e Merge
// ============================================================================

/**
 * Interface para dados de wardStat vindos do Firestore
 */
interface FirestoreWardStatData {
  wardKey: string;
  wardLabel: string;
  usageCount: number;
  lastUsedAt: string;
  updatedAt: string;
  userId?: string;
}

/**
 * Converte documento do Firestore para modelo local WardStat
 */
function convertFirestoreWardStatToLocal(
  id: string,
  data: FirestoreWardStatData,
  userId: string
): WardStat {
  const lastUsedAt = convertTimestampToDate(data.lastUsedAt) ?? new Date();
  const updatedAt = convertTimestampToDate(data.updatedAt) ?? new Date();

  return {
    id,
    userId,
    wardKey: data.wardKey,
    wardLabel: data.wardLabel,
    usageCount: data.usageCount,
    lastUsedAt,
    updatedAt,
  };
}

/**
 * Verifica se existe item pendente na syncQueue para um wardKey específico
 */
function hasLocalPendingWardStat(wardKey: string, pendingWardKeys: Set<string>): boolean {
  return pendingWardKeys.has(wardKey);
}

/**
 * Resolve conflito entre wardStat local e remota usando política definida.
 *
 * Regras:
 * - Se não existe local -> usar remote
 * - Se existe pendência local (na syncQueue) ->
 *   - preservar usageCount local
 *   - usar lastUsedAt mais recente (max)
 * - Se não há pendência ->
 *   - manter maior usageCount
 *   - para empate, maior lastUsedAt
 */
export function resolveWardStatConflict(
  local: WardStat | undefined,
  remote: FirestoreWardStatData,
  pendingWardKeys: Set<string>
): WardStat {
  const wardKey = remote.wardKey;

  // Caso 1: não existe local - usar remoto
  if (!local) {
    return convertFirestoreWardStatToLocal(
      `${remote.userId ?? ''}:${wardKey}`,
      remote,
      remote.userId ?? ''
    );
  }

  // Caso 2: existe pendência local - preservar contagem, usar lastUsedAt mais recente
  if (hasLocalPendingWardStat(wardKey, pendingWardKeys)) {
    const localTime = new Date(local.lastUsedAt).getTime();
    const remoteTime = new Date(remote.lastUsedAt).getTime();
    const lastUsedAt = localTime > remoteTime ? local.lastUsedAt : new Date(remote.lastUsedAt);

    return {
      ...local,
      lastUsedAt,
      updatedAt: new Date(),
    };
  }

  // Caso 3: sem pendência - aplicar regra normal (maior contagem, desempate por recência)
  if (remote.usageCount > local.usageCount) {
    return convertFirestoreWardStatToLocal(local.id, remote, local.userId);
  }

  if (local.usageCount > remote.usageCount) {
    return local;
  }

  // Empate de usageCount - usar mais recente
  const localTime = new Date(local.lastUsedAt).getTime();
  const remoteTime = new Date(remote.lastUsedAt).getTime();

  if (remoteTime > localTime) {
    return convertFirestoreWardStatToLocal(local.id, remote, local.userId);
  }

  return local;
}

/**
 * Obtém set de wardKeys com pendência local na syncQueue
 */
async function getPendingWardStatKeys(userId: string): Promise<Set<string>> {
  const pendingItems = await db.syncQueue
    .where('userId')
    .equals(userId)
    .and((item) => item.entityType === 'wardStat')
    .toArray();

  return new Set(pendingItems.map((item) => item.entityId));
}

/**
 * Pull inicial de wardStats remotos do Firestore para IndexedDB
 * Mescla com dados locais respeitando política de conflito
 */
export async function pullRemoteWardStats(): Promise<void> {
  const { user, loading } = getAuthState();

  if (loading || !user) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  const firestore = getFirebaseFirestore();

  if (!firestore) {
    console.warn('[VisitaMed] Firestore não configurado');
    return;
  }

  let pullError: string | null = null;

  try {
    const wardStatsCollection = collection(firestore, 'users', user.uid, 'wardStats');
    const wardStatsSnapshot = await getDocs(wardStatsCollection);

    if (wardStatsSnapshot.empty) {
      console.log('[VisitaMed] Nenhum wardStat remoto encontrado');
      return;
    }

    // Obter wardKeys com pendência local
    const pendingWardKeys = await getPendingWardStatKeys(user.uid);

    const wardStatsToUpsert: WardStat[] = [];

    for (const docSnap of wardStatsSnapshot.docs) {
      const data = docSnap.data() as FirestoreWardStatData;
      const remoteWardStat = { ...data, userId: user.uid };

      // Buscar wardStat local existente
      const id = `${user.uid}:${data.wardKey}`;
      const localWardStat = await db.wardStats.get(id);

      // Aplicar política de resolução de conflito
      const resolvedWardStat = resolveWardStatConflict(
        localWardStat,
        remoteWardStat,
        pendingWardKeys
      );

      wardStatsToUpsert.push(resolvedWardStat);
    }

    // Upsert into IndexedDB com wardStats resolvidos
    await db.wardStats.bulkPut(wardStatsToUpsert);

    console.log(`[VisitaMed] Pull de wardStats concluído: ${String(wardStatsToUpsert.length)} stats importados`);
  } catch (error) {
    pullError = error instanceof Error ? error.message : 'Erro no pull de wardStats remotos';
    console.error('[VisitaMed] Erro no pull de wardStats remotos:', error);
  }

  // Log de erro se houver (não atualiza status global para não sobrescrever info de notas)
  if (pullError) {
    console.warn('[VisitaMed] Erro no pull de wardStats:', pullError);
  }
}
