/**
 * VisitaMed Sync Service
 * Serviço de sincronização entre IndexedDB e Firestore (tags-first)
 */

import { db } from '@/services/db/dexie-db';
import type { Note, SyncStatus as NoteSyncStatus } from '@/models/note';
import type { VisitMember } from '@/models/visit-member';
import type { SyncQueueItem } from '@/models/sync-queue';
import { normalizeSettings, SETTINGS_ID, type Settings } from '@/models/settings';
import { normalizeTagList } from '@/models/tag';
import { getFirebaseFirestore } from '@/services/auth/firebase';
import { getAuthState } from '@/services/auth/auth-service';
import { triggerCurrentUserTagStatsRebuild } from '@/services/db/user-tag-stats-service';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  onSnapshot,
  type DocumentData,
  type Firestore,
  type UpdateData,
} from 'firebase/firestore';
import { VISIT_CONSTANTS, type Visit } from '@/models/visit';
import { SYNC_QUEUE_CONSTANTS } from '@/models/sync-queue';

/**
 * Tipo para dados de nota serializados para Firestore
 * Garante timestamps como Date válidos
 */
export interface SerializedNoteData {
  id: string;
  userId: string;
  visitId: string;
  date: string;
  bed: string;
  reference?: string;
  note: string;
  tags?: string[];
  syncStatus: NoteSyncStatus;
  createdAt: Date;
  updatedAt?: Date;
  expiresAt: Date;
  syncedAt?: Date;
}

/**
 * Helper para serializar nota para Firestore.
 * Garante que timestamps sejam Date válidos para evitar erros de tipo no Firestore.
 * Aceita Note (com Date) ou objeto com strings ISO (pós JSON.parse).
 */
export function serializeNoteForFirestore(note: Note): SerializedNoteData {
  // Helper interno para normalizar data com fallback seguro
  const normalizeDate = (value: unknown, fallback: Date): Date => {
    if (!value) return fallback;

    // Já é Date
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? fallback : value;
    }

    // String ISO
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? fallback : date;
    }

    // Firebase Timestamp (tem método toDate)
    if (typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }

    // Número (unix timestamp)
    if (typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? fallback : date;
    }

    return fallback;
  };

  const now = new Date();

  const serialized: SerializedNoteData = {
    id: note.id,
    userId: note.userId,
    visitId: note.visitId,
    date: note.date,
    bed: note.bed,
    note: note.note,
    syncStatus: note.syncStatus,
    createdAt: normalizeDate(note.createdAt, now),
    expiresAt: normalizeDate(note.expiresAt, now),
  };

  // Evitar campos undefined no payload Firestore (gera erro de serialização)
  if (note.reference !== undefined) {
    serialized.reference = note.reference;
  }

  if (note.tags !== undefined) {
    serialized.tags = note.tags;
  }

  if (note.updatedAt !== undefined) {
    serialized.updatedAt = normalizeDate(note.updatedAt, now);
  }

  if (note.syncedAt !== undefined) {
    serialized.syncedAt = normalizeDate(note.syncedAt, now);
  }

  return serialized;
}

export interface SerializedVisitData {
  id: string;
  userId: string;
  name: string;
  date: string;
  mode: 'private' | 'group';
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}

export function serializeVisitForFirestore(visit: Visit): SerializedVisitData {
  return {
    id: visit.id,
    userId: visit.userId,
    name: visit.name,
    date: visit.date,
    mode: visit.mode,
    createdAt: serializeDateLikeToIso(visit.createdAt),
    expiresAt: serializeDateLikeToIso(visit.expiresAt),
    updatedAt: serializeDateLikeToIso(visit.updatedAt),
  };
}

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

// ============================================================================
// Realtime da visita ativa (S5D)
// ============================================================================

let activeVisitRealtimeUnsubscribe: (() => void) | null = null;
let activeVisitRealtimeId: string | null = null;

/**
 * Ativa listener realtime de notas para a visita aberta.
 * Encerra listener anterior ao trocar visitId.
 * Pass null para desativar.
 */
export function setActiveVisitRealtime(visitId: string | null): void {
  // Se mesma visita, no-op
  if (visitId === activeVisitRealtimeId && activeVisitRealtimeUnsubscribe) {
    return;
  }

  // Encerra listener anterior
  if (activeVisitRealtimeUnsubscribe) {
    activeVisitRealtimeUnsubscribe();
    activeVisitRealtimeUnsubscribe = null;
    activeVisitRealtimeId = null;
    console.log('[VisitaMed] Realtime da visita anterior encerrado');
  }

  // Se null ou sem auth, sai aqui
  if (!visitId) {
    return;
  }

  const { user } = getAuthState();
  if (!user) {
    return;
  }

  const firestore = getFirebaseFirestore();
  if (!firestore) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[VisitaMed] Offline, não iniciando realtime');
    return;
  }

  // Inicia novo listener
  const notesRef = collection(firestore, 'visits', visitId, 'notes');
  const unsubscribe = onSnapshot(
    notesRef,
    (snapshot) => {
      const docs = snapshot.docs;
      const remoteNotes: Note[] = [];

      // Processar notas em background sem bloquear
      void (async () => {
        let hasRelevantLocalNoteChange = false;

        for (const docSnap of docs) {
          const data = docSnap.data() as FirestoreNoteData;
          const remoteNote = convertFirestoreNoteToLocal(docSnap.id, data, user.uid);

          // Buscar nota local para resolver conflito
          const localNote = await db.notes.get(docSnap.id);
          const resolvedNote = resolveNoteConflict(localNote, remoteNote);
          remoteNotes.push(resolvedNote);
        }

        // Bulk upsert das notas resolvidas
        if (remoteNotes.length > 0) {
          await db.notes.bulkPut(remoteNotes);
          hasRelevantLocalNoteChange = true;
          console.log(`[VisitaMed] Realtime: ${String(remoteNotes.length)} notas sincronizadas`);
        }

        // Reconciliar removidas: remover localmente apenas notas synced
        const remoteIds = new Set(remoteNotes.map((n) => n.id));
        const localSyncedNotes = await db.notes
          .where({ visitId, syncStatus: 'synced' })
          .toArray();

        const orphanedIds = localSyncedNotes
          .filter((n) => !remoteIds.has(n.id))
          .map((n) => n.id);

        if (orphanedIds.length > 0) {
          await db.notes.bulkDelete(orphanedIds);
          hasRelevantLocalNoteChange = true;
          console.log(`[VisitaMed] Realtime: ${String(orphanedIds.length)} notas removidas (synced)`);
        }

        if (hasRelevantLocalNoteChange) {
          triggerCurrentUserTagStatsRebuild();
        }
      })();
    },
    (error) => {
      console.warn('[VisitaMed] Erro no realtime de notas:', error);
    }
  );

  activeVisitRealtimeUnsubscribe = unsubscribe;
  activeVisitRealtimeId = visitId;
  console.log(`[VisitaMed] Realtime ativo para visita ${visitId}`);
}

/**
 * Cleanup do listener realtime
 */
function cleanupActiveVisitRealtime(): void {
  if (activeVisitRealtimeUnsubscribe) {
    activeVisitRealtimeUnsubscribe();
    activeVisitRealtimeUnsubscribe = null;
    activeVisitRealtimeId = null;
    console.log('[VisitaMed] Realtime da visita limpo');
  }
}

/**
 * Helper puro: verifica se item de nota deve ser pulado por haver delete posterior na fila.
 * Aplica política: delete vence update.
 */
export function shouldSkipNoteQueueItemDueToLaterDelete(
  item: SyncQueueItem,
  allPending: SyncQueueItem[]
): boolean {
  // Apenas para notas
  if (item.entityType !== 'note') {
    return false;
  }

  // Apenas para operações create/update (delete não precisa ser pulado)
  if (item.operation === 'delete') {
    return false;
  }

  // Buscar se há delete posterior do mesmo entityId
  const itemIndex = allPending.findIndex((i) => i.id === item.id);

  if (itemIndex < 0) {
    return false;
  }

  const laterItems = allPending.slice(itemIndex + 1);

  return laterItems.some(
    (later) =>
      later.entityType === 'note' &&
      later.entityId === item.entityId &&
      later.operation === 'delete'
  );
}

/**
 * Helper puro: detecta se erro é de permissão do Firestore.
 */
interface ErrorWithCode {
  code?: unknown;
  message?: unknown;
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const code = (error as ErrorWithCode).code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  if (!error || typeof error !== 'object') {
    return '';
  }

  const message = (error as ErrorWithCode).message;
  return typeof message === 'string' ? message.toLowerCase() : '';
}

export function isPermissionDeniedError(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  return (
    code.includes('permission-denied') ||
    code.includes('permission_denied') ||
    message.includes('permission-denied') ||
    message.includes('permission denied') ||
    message.includes('firestore.permission_denied') ||
    message.includes('missing or insufficient permissions')
  );
}

export function isNotFoundError(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  return (
    code.includes('not-found') ||
    code.includes('not_found') ||
    message.includes('not-found') ||
    message.includes('not found') ||
    message.includes('no document to update')
  );
}

export function isVisitMissingOrInaccessibleError(error: unknown): boolean {
  return isPermissionDeniedError(error) || isNotFoundError(error);
}

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
  cleanupActiveVisitRealtime();

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
      // Item pode ter sido removido durante tratamento de erro de item anterior
      const currentItem = await db.syncQueue.get(item.id);
      if (!currentItem) {
        continue;
      }

      // Pular item se houver delete posterior na fila (política: delete > update)
      if (shouldSkipNoteQueueItemDueToLaterDelete(currentItem, pendingItems)) {
        await db.syncQueue.delete(currentItem.id);
        console.log(
          `[VisitaMed] Pulando item ${currentItem.id} (delete posterior encontrado para nota ${currentItem.entityId})`
        );
        continue;
      }

      try {
        await processSyncItem(currentItem, firestore);
        await db.syncQueue.delete(currentItem.id);
      } catch (error) {
        await handleSyncError(currentItem, error);
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
 * Processa sync de visita (push para /visits/{visitId})
 */
function serializeDateLikeToIso(value: unknown): string {
  const parsed = convertTimestampToDate(value);
  return parsed ? parsed.toISOString() : new Date().toISOString();
}

async function processVisitSyncItem(item: SyncQueueItem, firestore: Firestore): Promise<void> {
  let visitPayload: Visit;

  try {
    visitPayload = JSON.parse(item.payload) as Visit;
  } catch {
    throw new Error('Payload inválido na fila de sincronização de visita');
  }

  const visitRef = doc(firestore, 'visits', item.entityId);

  if (item.operation === 'delete') {
    await deleteDoc(visitRef);
    return;
  }

  // create ou update: usar setDoc com merge
  await setDoc(visitRef, serializeVisitForFirestore(visitPayload), { merge: true });

  // Hardening: garantir membership owner remoto para evitar visitas órfãs sem ACL
  const ownerMemberRef = doc(firestore, 'visits', visitPayload.id, 'members', visitPayload.userId);
  await setDoc(
    ownerMemberRef,
    {
      id: `${visitPayload.id}:${visitPayload.userId}`,
      visitId: visitPayload.id,
      userId: visitPayload.userId,
      role: 'owner',
      status: 'active',
      createdAt: serializeDateLikeToIso(visitPayload.createdAt),
      updatedAt: serializeDateLikeToIso(visitPayload.updatedAt ?? visitPayload.createdAt),
    },
    { merge: true }
  );
}

/**
 * Processa sync de membership de visita (push para /visits/{visitId}/members/{userId})
 */
async function processVisitMemberSyncItem(item: SyncQueueItem, firestore: Firestore): Promise<void> {
  let memberPayload: VisitMember;

  try {
    memberPayload = JSON.parse(item.payload) as VisitMember;
  } catch {
    throw new Error('Payload inválido na fila de sincronização de membership');
  }

  // Extrair userId do payload ou do entityId (formato visitId:userId)
  const [entityVisitId, entityUserId] = item.entityId.split(':');
  const userId = memberPayload.userId || entityUserId;
  const visitId = memberPayload.visitId || entityVisitId;

  if (!userId || !visitId) {
    throw new Error('Dados inválidos para sync de membership');
  }

  const memberRef = doc(firestore, 'visits', visitId, 'members', userId);

  if (item.operation === 'delete') {
    await deleteDoc(memberRef);
    return;
  }

  // create ou update: usar setDoc com merge
  await setDoc(
    memberRef,
    {
      id: memberPayload.id || `${visitId}:${userId}`,
      visitId,
      userId,
      role: memberPayload.role,
      status: memberPayload.status,
      createdAt: serializeDateLikeToIso(memberPayload.createdAt),
      updatedAt: serializeDateLikeToIso(memberPayload.updatedAt),
    },
    { merge: true }
  );
}

/**
 * Processa um item da fila de sincronização
 */
async function processSyncItem(item: SyncQueueItem, firestore: Firestore): Promise<void> {
  switch (item.entityType) {
    case 'note':
      await processNoteSyncItem(item, firestore);
      return;
    case 'settings':
      await processSettingsSyncItem(item, firestore);
      return;
    case 'visit':
      await processVisitSyncItem(item, firestore);
      return;
    case 'visit-member':
      await processVisitMemberSyncItem(item, firestore);
      return;
  }
}

/**
 * Busca memberships locais ativos do usuário
 */
async function getActiveMemberships(userId: string): Promise<VisitMember[]> {
  return db.visitMembers
    .where({ userId, status: 'active' })
    .toArray();
}

/**
 * Faz bootstrap best-effort de dados mínimos da visita para owner local.
 * Cria/atualiza /visits/{visitId} e /visits/{visitId}/members/{uid}.
 */
async function bootstrapVisitForOwner(
  firestore: Firestore,
  visitId: string,
  userId: string
): Promise<void> {
  try {
    // Bootstrap mínimo do documento da visita
    const visitRef = doc(firestore, 'visits', visitId);
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + VISIT_CONSTANTS.EXPIRATION_DAYS);

    await setDoc(
      visitRef,
      {
        id: visitId,
        userId, // owner
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );

    // Bootstrap do membership owner
    const memberRef = doc(firestore, 'visits', visitId, 'members', userId);
    await setDoc(
      memberRef,
      {
        id: `${visitId}:${userId}`,
        visitId,
        userId,
        role: 'owner',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn(`[VisitaMed] Bootstrap de visita ${visitId} falhou (best-effort):`, error);
  }
}

/**
 * Faz mirror best-effort de nota para /visits/{visitId}/notes/{noteId}
 */
async function mirrorNoteToVisit(
  firestore: Firestore,
  visitId: string,
  noteId: string,
  noteData: DocumentData
): Promise<void> {
  if (!visitId) {
    return;
  }

  try {
    const visitNoteRef = doc(firestore, 'visits', visitId, 'notes', noteId);
    await setDoc(visitNoteRef, noteData, { merge: true });
  } catch (error) {
    console.warn(`[VisitaMed] Mirror de nota ${noteId} para visita ${visitId} falhou (best-effort):`, error);
  }
}

/**
 * Remove nota espelhada da visita (best-effort)
 */
async function deleteMirroredVisitNote(
  firestore: Firestore,
  visitId: string,
  noteId: string
): Promise<void> {
  if (!visitId) {
    return;
  }

  try {
    const visitNoteRef = doc(firestore, 'visits', visitId, 'notes', noteId);
    await deleteDoc(visitNoteRef);
  } catch (error) {
    console.warn(`[VisitaMed] Delete do mirror da nota ${noteId} na visita ${visitId} falhou (best-effort):`, error);
  }
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

  // Serializar note com timestamps normalizados para Firestore
  const noteData = serializeNoteForFirestore(notePayload);
  const noteRef = doc(firestore, 'users', item.userId, 'notes', item.entityId);

  // === SYNC LEGADO (sempre executa) ===
  if (item.operation === 'create') {
    await setDoc(noteRef, noteData);
  }

  if (item.operation === 'update') {
    // Sem fallback setDoc merge - erro será tratado em handleSyncError
    await updateDoc(noteRef, noteData as unknown as UpdateData<DocumentData>);
  }

  if (item.operation === 'delete') {
    await deleteDoc(noteRef);
  }

  // === BOOTSTRAP PARA OWNER LOCAL (best-effort) ===
  if (item.operation !== 'delete' && notePayload.visitId) {
    const activeMemberships = await getActiveMemberships(item.userId);
    const ownerMembership = activeMemberships.find(
      (m) => m.visitId === notePayload.visitId && m.role === 'owner'
    );

    if (ownerMembership) {
      await bootstrapVisitForOwner(firestore, notePayload.visitId, item.userId);
    }
  }

  // === MIRROR PARA VISITA (best-effort) ===
  if (notePayload.visitId) {
    if (item.operation === 'delete') {
      await deleteMirroredVisitNote(firestore, notePayload.visitId, item.entityId);
    } else {
      await mirrorNoteToVisit(
        firestore,
        notePayload.visitId,
        item.entityId,
        noteData
      );
    }
  }

  if (item.operation !== 'delete') {
    await db.notes.update(item.entityId, {
      syncStatus: 'synced',
      syncedAt: new Date(),
    });
  }
}

/**
 * Payload do sync de settings
 */
interface SettingsSyncPayload {
  inputPreferences: {
    uppercaseBed: boolean;
  };
  updatedAt: string;
}

/**
 * Processa sync de settings
 */
async function processSettingsSyncItem(item: SyncQueueItem, firestore: Firestore): Promise<void> {
  let payload: SettingsSyncPayload;

  try {
    payload = JSON.parse(item.payload) as SettingsSyncPayload;
  } catch {
    throw new Error('Payload inválido na fila de sincronização de settings');
  }

  const settingsRef = doc(firestore, 'users', item.userId, 'settings', SETTINGS_ID);

  if (item.operation === 'delete') {
    await deleteDoc(settingsRef);
    return;
  }

  await setDoc(
    settingsRef,
    {
      ...payload,
      userId: item.userId,
      updatedAt: payload.updatedAt,
    },
    { merge: true }
  );

  await db.settings.put(
    normalizeSettings(
      {
        id: SETTINGS_ID,
        userId: item.userId,
        inputPreferences: payload.inputPreferences,
        updatedAt: payload.updatedAt,
      },
      item.userId
    )
  );
}

// Removido: processWardStatSyncItem (tags-first)

/**
 * Trata erros de sincronização
 */
async function handleSyncError(item: SyncQueueItem, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Erro desconhecido';
  const retryCount = item.retryCount + 1;
  const lastAttemptAt = new Date();

  const visitId = getVisitIdFromSyncQueueItem(item);
  const isVisitScopedEntity =
    item.entityType === 'visit' ||
    item.entityType === 'visit-member' ||
    item.entityType === 'note';

  // Hotfix: editor/viewer não têm permissão para update em /visits/{visitId}.
  // Nesse caso, descartar apenas o item inválido da fila, sem purge local da visita.
  if (
    item.entityType === 'visit' &&
    item.operation === 'update' &&
    isPermissionDeniedError(error)
  ) {
    console.warn(
      `[VisitaMed] Permission denied em visit:update (${item.entityId}). Descartando apenas item da fila, sem limpeza local.`
    );

    await db.syncQueue.delete(item.id);
    return;
  }

  if (visitId && isVisitScopedEntity && isVisitMissingOrInaccessibleError(error)) {
    console.warn(
      `[VisitaMed] Visita ${visitId} indisponível remotamente durante sync (${item.entityType}:${item.operation}). Limpando dados locais relacionados.`
    );

    await removeVisitDataLocallyByVisitId(visitId, item.userId);
    return;
  }

  // Fallback legado para nota sem visitId associada
  if (item.entityType === 'note' && isPermissionDeniedError(error)) {
    console.warn(
      `[VisitaMed] Permission denied para nota ${item.entityId}: descartando dados locais`
    );

    await db.notes.delete(item.entityId);
    await db.syncQueue.delete(item.id);
    return;
  }

  if (retryCount >= SYNC_QUEUE_CONSTANTS.MAX_RETRIES) {
    console.error('[VisitaMed] Item excedeu máximo de tentativas:', item.id);
    await db.syncQueue.update(item.id, {
      retryCount,
      error: message,
      lastAttemptAt,
    });

    // Marca sincronização falhou apenas para notas
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
 * Pipeline completo: push local + pull remoto (memberships/visitas + notas + settings)
 */
async function syncIfAuthenticated(): Promise<void> {
  const { user, loading } = getAuthState();

  if (loading || !user) {
    return;
  }

  // Pipeline completo nesta ordem:
  // 1. Push: enviar itens pendentes locais para Firestore
  await syncNow();

  // 2. Pull: hidratar memberships e visitas remotas
  await pullRemoteVisitMembershipsAndVisits();

  // 3. Pull: hidratar notas remotas
  await pullRemoteNotes();

  // 4. Pull: hidratar settings remotos
  await pullRemoteSettings();
}

/**
 * Obtém timestamp para comparação (updatedAt ?? createdAt)
 */
export function getNoteTimestamp(note: Note): Date {
  return note.updatedAt ?? note.createdAt;
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
  const localVersion = getNoteTimestamp(local);
  const remoteVersion = getNoteTimestamp(remote);

  if (remoteVersion > localVersion) {
    return remote;
  }

  // Empate ou local mais novo - manter local
  return local;
}

/**
 * Deduplica notas remotas por ID, mantendo a versão com timestamp mais recente.
 * Usa updatedAt como prioridade, createdAt como fallback.
 */
export function deduplicateNotes(notes: Note[]): Note[] {
  const noteMap = new Map<string, Note>();

  for (const note of notes) {
    const existing = noteMap.get(note.id);

    if (!existing) {
      noteMap.set(note.id, note);
      continue;
    }

    // Comparar timestamps
    const existingTime = getNoteTimestamp(existing);
    const noteTime = getNoteTimestamp(note);

    // Manter a versão mais recente
    if (noteTime > existingTime) {
      noteMap.set(note.id, note);
    }
  }

  return Array.from(noteMap.values());
}

/**
 * Pull inicial de notas remotas do Firestore para IndexedDB
 * Hidrata dados locais no login usando notas já existentes na nuvem
 */
interface PullNotesFromVisitsResult {
  notes: Note[];
  failedVisitIds: string[];
}

/**
 * Busca notas de /visits/{visitId}/notes para memberships locais ativos
 */
async function pullNotesFromVisits(
  firestore: Firestore,
  userId: string
): Promise<PullNotesFromVisitsResult> {
  const activeMemberships = await getActiveMemberships(userId);
  const allNotes: Note[] = [];
  const failedVisitIds: string[] = [];

  for (const membership of activeMemberships) {
    try {
      const visitNotesCollection = collection(firestore, 'visits', membership.visitId, 'notes');
      const visitNotesSnapshot = await getDocs(visitNotesCollection);

      for (const docSnap of visitNotesSnapshot.docs) {
        const data = docSnap.data() as FirestoreNoteData;
        const remoteNote = convertFirestoreNoteToLocal(docSnap.id, data, userId);

        // Aplicar mesma política de conflito usada no pull legado
        const localNote = await db.notes.get(docSnap.id);
        const resolvedNote = resolveNoteConflict(localNote, remoteNote);
        allNotes.push(resolvedNote);
      }
    } catch (error) {
      failedVisitIds.push(membership.visitId);
      console.warn(`[VisitaMed] Pull de notas da visita ${membership.visitId} falhou:`, error);
    }
  }

  return {
    notes: allNotes,
    failedVisitIds,
  };
}

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
    // === PULL LEGADO: /users/{uid}/notes ===
    const notesCollection = collection(firestore, 'users', user.uid, 'notes');
    const notesSnapshot = await getDocs(notesCollection);

    const legacyNotes: Note[] = [];

    for (const docSnap of notesSnapshot.docs) {
      const data = docSnap.data() as FirestoreNoteData;
      const remoteNote = convertFirestoreNoteToLocal(docSnap.id, data, user.uid);

      // Buscar nota local existente
      const localNote = await db.notes.get(docSnap.id);

      // Aplicar política de resolução de conflito
      const resolvedNote = resolveNoteConflict(localNote, remoteNote);

      // Log de debug apenas quando há conflito real
      if (localNote && localNote.syncStatus !== 'pending' && localNote.syncStatus !== 'failed') {
        const localVersion = getNoteTimestamp(localNote);
        const remoteVersion = getNoteTimestamp(remoteNote);
        if (remoteVersion > localVersion) {
          console.debug(`[VisitaMed] Conflito resolvido (remote wins): ${docSnap.id}`);
        } else if (localVersion > remoteVersion) {
          console.debug(`[VisitaMed] Conflito resolvido (local wins): ${docSnap.id}`);
        }
      }

      legacyNotes.push(resolvedNote);
    }

    // === PULL POR VISITA: /visits/{visitId}/notes ===
    const visitPullResult = await pullNotesFromVisits(firestore, user.uid);
    const visitNotes = visitPullResult.notes;
    const hasPartialVisitPull = visitPullResult.failedVisitIds.length > 0;

    if (hasPartialVisitPull) {
      console.warn(
        `[VisitaMed] Pull de notas parcial: ${String(visitPullResult.failedVisitIds.length)} visita(s) com falha (${visitPullResult.failedVisitIds.join(', ')}).`
      );
    }

    // === DEDUPLICAR NOTAS REMOTAS ===
    const allRemoteNotes = [...legacyNotes, ...visitNotes];
    const deduplicatedNotes = deduplicateNotes(allRemoteNotes);
    const notesToUpsert = deduplicatedNotes;

    // Upsert into IndexedDB com notas resolvidas e deduplicadas
    await db.notes.bulkPut(notesToUpsert);

    let hasRelevantLocalNoteChange = notesToUpsert.length > 0;

    // Reconciliação: remover localmente notas órfãs (deletadas remotamente)
    // Só remove notas com syncStatus 'synced' para não perder alterações locais pendentes
    // Hardening: em pull parcial por visita, não executar cleanup destrutivo neste ciclo.
    if (hasPartialVisitPull) {
      console.warn(
        '[VisitaMed] Pulando cleanup de notas órfãs neste ciclo por pull remoto parcial/incompleto'
      );
    } else {
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
        hasRelevantLocalNoteChange = true;
        console.log(`[VisitaMed] ${String(orphanedIds.length)} notas órfãs removidas localmente`);
      }
    }

    if (hasRelevantLocalNoteChange) {
      triggerCurrentUserTagStatsRebuild();
    }

    const legacyCount = legacyNotes.length;
    const visitCount = visitNotes.length;
    const uniqueCount = notesToUpsert.length;
    const deduplicationStatus = uniqueCount < legacyCount + visitCount ? 'deduplicadas' : 'únicas';
    const pullMode = hasPartialVisitPull ? 'parcial' : 'completo';
    console.log(
      `[VisitaMed] Pull ${pullMode} concluído: ${String(uniqueCount)} notas (${String(legacyCount)} legacy + ${String(visitCount)} visitas, ${deduplicationStatus})`
    );
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
  visitId: string | null;
  date: string | null;
  bed: string | null;
  reference?: string;
  note: string | null;
  tags?: unknown;
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

  // Tags são fonte de verdade
  const tags = normalizeTagList(data.tags);

  return {
    id,
    userId,
    visitId: data.visitId ?? '',
    date: data.date ?? '',
    bed: data.bed ?? '',
    reference: data.reference,
    note: data.note ?? '',
    tags,
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
// Settings - Pull e Merge (tags-first)
// ============================================================================

interface FirestoreSettingsData {
  inputPreferences?: {
    uppercaseBed?: boolean;
  };
  updatedAt?: unknown;
  userId?: string;
}

async function hasPendingSettingsSync(userId: string): Promise<boolean> {
  const pending = await db.syncQueue
    .where('userId')
    .equals(userId)
    .and((item) => item.entityType === 'settings' && item.entityId === SETTINGS_ID)
    .count();

  return pending > 0;
}

export function resolveSettingsConflict(
  local: Settings | undefined,
  remoteData: FirestoreSettingsData,
  userId: string,
  pendingLocal: boolean
): Settings {
  const remoteUpdatedAt = convertTimestampToDate(remoteData.updatedAt) ?? new Date();
  const remote = normalizeSettings(
    {
      id: SETTINGS_ID,
      userId,
      inputPreferences: remoteData.inputPreferences,
      updatedAt: remoteUpdatedAt,
    },
    userId
  );

  if (!local) {
    return remote;
  }

  if (pendingLocal) {
    return local;
  }

  return remote.updatedAt > local.updatedAt ? remote : local;
}

export async function pullRemoteSettings(): Promise<void> {
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

  try {
    const settingsRef = doc(firestore, 'users', user.uid, 'settings', SETTINGS_ID);
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return;
    }

    const remoteData = settingsSnap.data() as FirestoreSettingsData;
    const localRaw = await db.settings.get(SETTINGS_ID);
    const local = localRaw?.userId === user.uid ? normalizeSettings(localRaw, user.uid) : undefined;
    const pendingLocal = await hasPendingSettingsSync(user.uid);

    const resolved = resolveSettingsConflict(local, remoteData, user.uid, pendingLocal);
    await db.settings.put(resolved);
  } catch (error) {
    console.warn('[VisitaMed] Erro no pull de settings:', error);
  }
}

// ============================================================================
// S14A - Pull remoto de memberships + visitas no login (hidratação multi-dispositivo)
// ============================================================================

interface FirestoreMemberData {
  id: string;
  visitId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'active' | 'removed';
  createdAt: unknown;
  updatedAt?: unknown;
  removedAt?: unknown;
}

interface FirestoreVisitData {
  id: string;
  userId: string;
  name: string;
  date: string;
  mode: 'private' | 'group';
  createdAt: unknown;
  expiresAt?: unknown;
  updatedAt?: unknown;
}

interface MembershipReconciliationInput {
  localMembershipVisitIds: string[];
  remoteMemberships: VisitMember[];
}

interface MembershipReconciliationResult {
  activeVisitIds: string[];
  removedVisitIds: string[];
  orphanedVisitIds: string[];
}

export function reconcileMembershipVisitIds(input: MembershipReconciliationInput): MembershipReconciliationResult {
  const remoteVisitIds = new Set(input.remoteMemberships.map((member) => member.visitId));

  const activeVisitIds = [...new Set(
    input.remoteMemberships
      .filter((member) => member.status === 'active')
      .map((member) => member.visitId)
  )];

  const removedVisitIds = [...new Set(
    input.remoteMemberships
      .filter((member) => member.status === 'removed')
      .map((member) => member.visitId)
  )];

  const orphanedVisitIds = [...new Set(
    input.localMembershipVisitIds.filter((visitId) => !remoteVisitIds.has(visitId))
  )];

  return { activeVisitIds, removedVisitIds, orphanedVisitIds };
}

function getVisitIdFromSyncQueueItem(item: SyncQueueItem): string | null {
  if (item.entityType === 'visit') {
    return item.entityId;
  }

  if (item.entityType === 'visit-member') {
    const [visitId] = item.entityId.split(':');
    return visitId || null;
  }

  if (item.entityType !== 'note') {
    return null;
  }

  try {
    const payload = JSON.parse(item.payload) as { visitId?: unknown };
    return typeof payload.visitId === 'string' && payload.visitId.trim() !== ''
      ? payload.visitId
      : null;
  } catch {
    return null;
  }
}

async function removePendingSyncItemsForVisitInTransaction(userId: string, visitId: string): Promise<void> {
  const pendingItems = await db.syncQueue.where('userId').equals(userId).toArray();

  for (const item of pendingItems) {
    if (getVisitIdFromSyncQueueItem(item) === visitId) {
      await db.syncQueue.delete(item.id);
    }
  }
}

export async function removeVisitDataLocallyByVisitId(
  visitId: string,
  userId: string
): Promise<void> {
  await db.transaction('rw', [db.visits, db.notes, db.visitMembers, db.visitInvites, db.syncQueue], async () => {
    await removePendingSyncItemsForVisitInTransaction(userId, visitId);
    await db.notes.where('visitId').equals(visitId).delete();
    await db.visitMembers.where('visitId').equals(visitId).delete();
    await db.visitInvites.where('visitId').equals(visitId).delete();
    await db.visits.delete(visitId);
  });
}

/**
 * Converte dados de membership remoto para formato local
 */
function convertFirestoreMemberToLocal(data: FirestoreMemberData): VisitMember {
  const createdAt = convertTimestampToDate(data.createdAt) ?? new Date();
  const updatedAt = convertTimestampToDate(data.updatedAt) ?? createdAt;
  const removedAt = convertTimestampToDate(data.removedAt);

  return {
    // Em collectionGroup('members'), doc.id costuma ser apenas userId.
    // Mantemos o formato canônico local "visitId:userId" para compatibilidade.
    id: data.id || `${data.visitId}:${data.userId}`,
    visitId: data.visitId,
    userId: data.userId,
    role: data.role,
    status: data.status,
    createdAt,
    updatedAt,
    ...(removedAt && { removedAt }),
  };
}

/**
 * Converte dados de visita remota para formato local
 */
function convertFirestoreVisitToLocal(
  id: string,
  data: FirestoreVisitData,
  userId: string
): Visit {
  const createdAt = convertTimestampToDate(data.createdAt) ?? new Date();
  const updatedAt = convertTimestampToDate(data.updatedAt);

  const fallbackExpiresAt = new Date(createdAt);
  fallbackExpiresAt.setDate(fallbackExpiresAt.getDate() + VISIT_CONSTANTS.EXPIRATION_DAYS);

  const expiresAt = convertTimestampToDate(data.expiresAt) ?? fallbackExpiresAt;

  return {
    id,
    userId,
    name: data.name || '',
    date: data.date || '',
    mode: data.mode === 'group' ? 'group' : 'private',
    createdAt,
    expiresAt,
    updatedAt,
  };
}

/**
 * Pull remoto de memberships ativos e visitas correspondentes.
 * Hidrata a base local no login para permitir sync multi-dispositivo.
 * Best-effort: erro de uma visita não aborta o pull completo.
 */
export async function pullRemoteVisitMembershipsAndVisits(): Promise<void> {
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

  try {
    const membersQuery = query(
      collectionGroup(firestore, 'members'),
      where('userId', '==', user.uid)
    );

    const membersSnapshot = await getDocs(membersQuery);

    const remoteMembers: VisitMember[] = [];
    for (const docSnap of membersSnapshot.docs) {
      const data = docSnap.data() as FirestoreMemberData;
      if (!data.visitId) {
        continue;
      }
      remoteMembers.push(convertFirestoreMemberToLocal(data));
    }

    let hasRelevantAccessChange = remoteMembers.length > 0;

    if (remoteMembers.length > 0) {
      await db.visitMembers.bulkPut(remoteMembers);
    }

    const localUserMemberships = await db.visitMembers.where('userId').equals(user.uid).toArray();
    const reconciliation = reconcileMembershipVisitIds({
      localMembershipVisitIds: localUserMemberships.map((member) => member.visitId),
      remoteMemberships: remoteMembers,
    });

    const visitIdsToClean = new Set<string>(reconciliation.removedVisitIds);

    if (reconciliation.removedVisitIds.length > 0) {
      console.log(
        `[VisitaMed] Remoção confirmada por membership remoto: ${String(reconciliation.removedVisitIds.length)} visita(s)`
      );
    }

    if (reconciliation.orphanedVisitIds.length > 0) {
      console.warn(
        `[VisitaMed] Ausência remota ambígua para ${String(reconciliation.orphanedVisitIds.length)} visita(s) órfã(s) (${reconciliation.orphanedVisitIds.join(', ')}). Cleanup local adiado neste ciclo.`
      );
    }

    const failedActiveVisitFetchIds: string[] = [];

    for (const visitId of reconciliation.activeVisitIds) {
      try {
        const visitRef = doc(firestore, 'visits', visitId);
        const visitSnap = await getDoc(visitRef);

        if (!visitSnap.exists()) {
          visitIdsToClean.add(visitId);
          console.warn(
            `[VisitaMed] Visita ${visitId} não encontrada após fetch remoto bem-sucedido. Marcando limpeza local confirmada.`
          );
          continue;
        }

        const visitData = visitSnap.data() as FirestoreVisitData;
        const visit = convertFirestoreVisitToLocal(visitId, visitData, user.uid);
        await db.visits.put(visit);
        hasRelevantAccessChange = true;
      } catch (visitError) {
        failedActiveVisitFetchIds.push(visitId);
        console.warn(`[VisitaMed] Erro ao hidratar visita ${visitId}:`, visitError);
      }
    }

    if (failedActiveVisitFetchIds.length > 0) {
      console.warn(
        `[VisitaMed] Pull de visitas incompleto: ${String(failedActiveVisitFetchIds.length)} visita(s) ativa(s) sem hidratação (${failedActiveVisitFetchIds.join(', ')}).`
      );
    }

    for (const visitId of visitIdsToClean) {
      await removeVisitDataLocallyByVisitId(visitId, user.uid);
      hasRelevantAccessChange = true;
    }

    if (hasRelevantAccessChange) {
      triggerCurrentUserTagStatsRebuild();
    }

    console.log('[VisitaMed] Pull de memberships e visitas concluído');
  } catch (error) {
    console.warn('[VisitaMed] Erro no pull de memberships/visitas:', error);
  }
}
