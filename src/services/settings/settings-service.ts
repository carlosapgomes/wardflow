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
  type WardPreferences,
} from '@/models/settings';
import { createSyncQueueItem } from '@/models/sync-queue';
import { normalizeWardKey, normalizeWardLabel, type WardStat } from '@/models/ward-stat';

export interface WardSuggestionItem {
  wardKey: string;
  wardLabel: string;
  usageCount: number;
  lastUsedAt: Date;
  hidden: boolean;
}

interface SettingsSyncPayload {
  inputPreferences: InputPreferences;
  wardPreferences: WardPreferences;
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
    wardPreferences: settings.wardPreferences,
    updatedAt: settings.updatedAt.toISOString(),
  };
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

export function applyWardPreferencesToLabels(
  labels: string[],
  wardPreferences: WardPreferences
): string[] {
  const result: string[] = [];
  const seenKeys = new Set<string>();

  for (const label of labels) {
    const wardKey = normalizeWardKey(label);

    if (!wardKey || seenKeys.has(wardKey)) {
      continue;
    }

    if (wardPreferences.hiddenWardKeys.includes(wardKey)) {
      continue;
    }

    const finalLabel = wardPreferences.labelOverrides[wardKey] ?? normalizeWardLabel(label);
    if (!finalLabel) {
      continue;
    }

    result.push(finalLabel);
    seenKeys.add(wardKey);
  }

  return result;
}

export function buildWardSuggestionItems(
  stats: WardStat[],
  wardPreferences: WardPreferences,
  includeHidden = false
): WardSuggestionItem[] {
  return stats
    .map((stat) => {
      const hidden = wardPreferences.hiddenWardKeys.includes(stat.wardKey);
      const wardLabel = wardPreferences.labelOverrides[stat.wardKey] ?? stat.wardLabel;

      return {
        wardKey: stat.wardKey,
        wardLabel,
        usageCount: stat.usageCount,
        lastUsedAt: stat.lastUsedAt,
        hidden,
      };
    })
    .filter((item) => includeHidden || !item.hidden);
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

  return next;
}

export async function hideWardSuggestion(wardKeyInput: string): Promise<Settings> {
  const wardKey = normalizeWardKey(wardKeyInput);

  if (!wardKey) {
    return getUserSettings();
  }

  const current = await getUserSettings();

  const hiddenWardKeys = current.wardPreferences.hiddenWardKeys.includes(wardKey)
    ? current.wardPreferences.hiddenWardKeys
    : [...current.wardPreferences.hiddenWardKeys, wardKey];

  const next: Settings = {
    ...current,
    wardPreferences: {
      ...current.wardPreferences,
      hiddenWardKeys,
    },
    updatedAt: new Date(),
  };

  await db.transaction('rw', db.settings, db.syncQueue, async () => {
    await saveSettingsInTransaction(next);
  });

  return next;
}

export async function restoreWardSuggestion(wardKeyInput: string): Promise<Settings> {
  const wardKey = normalizeWardKey(wardKeyInput);

  if (!wardKey) {
    return getUserSettings();
  }

  const current = await getUserSettings();

  const hiddenWardKeys = current.wardPreferences.hiddenWardKeys.filter((key) => key !== wardKey);

  const next: Settings = {
    ...current,
    wardPreferences: {
      ...current.wardPreferences,
      hiddenWardKeys,
    },
    updatedAt: new Date(),
  };

  await db.transaction('rw', db.settings, db.syncQueue, async () => {
    await saveSettingsInTransaction(next);
  });

  return next;
}

export async function setWardLabelOverride(
  wardKeyInput: string,
  wardLabelInput: string
): Promise<Settings> {
  const wardKey = normalizeWardKey(wardKeyInput);

  if (!wardKey) {
    return getUserSettings();
  }

  const wardLabel = normalizeWardLabel(wardLabelInput);
  const current = await getUserSettings();

  const currentOverrides = { ...current.wardPreferences.labelOverrides };

  const labelOverrides = wardLabel
    ? {
        ...currentOverrides,
        [wardKey]: wardLabel,
      }
    : Object.fromEntries(
        Object.entries(currentOverrides).filter(([key]) => key !== wardKey)
      );

  const next: Settings = {
    ...current,
    wardPreferences: {
      ...current.wardPreferences,
      labelOverrides,
    },
    updatedAt: new Date(),
  };

  await db.transaction('rw', db.settings, db.syncQueue, async () => {
    await saveSettingsInTransaction(next);
  });

  return next;
}

export async function getInputPreferences(): Promise<InputPreferences> {
  const settings = await getUserSettings();
  return settings.inputPreferences;
}
