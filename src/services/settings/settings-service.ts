/**
 * VisitaMed Settings Service
 * Persistência e utilitários de configurações do usuário
 */

import { db } from '@/services/db/dexie-db';
import { getAuthState } from '@/services/auth/auth-service';
import {
  createSettings,
  normalizeSettings,
  SETTINGS_ID,
  type InputPreferences,
  type Settings,
} from '@/models/settings';
import { createSyncQueueItem } from '@/models/sync-queue';

interface SettingsSyncPayload {
  inputPreferences: InputPreferences;
  updatedAt: string;
}

function requireUserId(): string {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado');
  }

  return user.uid;
}

function serializeForSync(settings: Settings): SettingsSyncPayload {
  return {
    inputPreferences: settings.inputPreferences,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

/**
 * Dispara sync imediato em fire-and-forget se online + autenticado
 * Não bloqueia o fluxo de UI, não lança erro para o usuário
 */
function triggerImmediateSync(): void {
  const { user } = getAuthState();

  if (!user) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  // Fire-and-forget: sem await para não bloquear fluxo local
  void import('@/services/sync/sync-service')
    .then(({ syncNow }) => syncNow())
    .catch((error: unknown) => {
      console.warn('[Settings] Sync imediato falhou (best-effort):', error);
    });
}

async function queueSettingsSyncInTransaction(settings: Settings): Promise<void> {
  const item = createSyncQueueItem(
    settings.userId,
    'update',
    'settings',
    SETTINGS_ID,
    serializeForSync(settings)
  );

  await db.syncQueue
    .where('userId')
    .equals(settings.userId)
    .and((entry) => entry.entityType === 'settings' && entry.entityId === SETTINGS_ID)
    .delete();

  await db.syncQueue.add(item);
}

async function getExistingSettingsForUser(userId: string): Promise<Settings | undefined> {
  const stored = await db.settings.get(SETTINGS_ID);

  if (!stored) {
    return undefined;
  }

  if (stored.userId !== userId) {
    return undefined;
  }

  return normalizeSettings(stored, userId);
}

async function saveSettingsInTransaction(settings: Settings): Promise<void> {
  await db.settings.put(settings);
  await queueSettingsSyncInTransaction(settings);
}

export function applyInputCase(value: string, useUppercase: boolean): string {
  return useUppercase ? value.toUpperCase() : value;
}

export async function getUserSettings(): Promise<Settings> {
  const userId = requireUserId();
  const existing = await getExistingSettingsForUser(userId);

  if (existing) {
    return existing;
  }

  const created = createSettings(userId);
  await db.settings.put(created);
  return created;
}

export async function updateInputPreferences(
  updates: Partial<InputPreferences>
): Promise<Settings> {
  const userId = requireUserId();
  const current = await getUserSettings();

  const next: Settings = {
    ...current,
    userId,
    inputPreferences: {
      ...current.inputPreferences,
      ...updates,
    },
    updatedAt: new Date(),
  };

  await db.transaction('rw', db.settings, db.syncQueue, async () => {
    await saveSettingsInTransaction(next);
  });

  // Sync imediato se online + autenticado (fire-and-forget)
  triggerImmediateSync();

  return next;
}

export async function getInputPreferences(): Promise<InputPreferences> {
  const settings = await getUserSettings();
  return settings.inputPreferences;
}
