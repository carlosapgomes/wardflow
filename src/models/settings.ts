/**
 * VisitaMed Settings Model
 * Configurações do usuário
 */

import { normalizeWardKey, normalizeWardLabel } from '@/models/ward-stat';

export interface InputPreferences {
  /** Mantém Ala/Setor em maiúsculas automaticamente */
  uppercaseWard: boolean;

  /** Mantém Leito em maiúsculas automaticamente */
  uppercaseBed: boolean;
}

export interface WardPreferences {
  /** Alas ocultas das sugestões (por chave canônica) */
  hiddenWardKeys: string[];

  /** Rótulos customizados por ala (key canônica -> label exibida) */
  labelOverrides: Record<string, string>;
}

export interface Settings {
  /** ID único das configurações (sempre 'user-settings') */
  id: 'user-settings';

  /** ID do usuário */
  userId: string;

  /** Preferências de transformação de inputs */
  inputPreferences: InputPreferences;

  /** Preferências de apresentação/ocultação de alas */
  wardPreferences: WardPreferences;

  /** Timestamp da última atualização */
  updatedAt: Date;
}

export const SETTINGS_ID: Settings['id'] = 'user-settings';

export const DEFAULT_INPUT_PREFERENCES: InputPreferences = {
  uppercaseWard: false,
  uppercaseBed: true,
};

export const DEFAULT_WARD_PREFERENCES: WardPreferences = {
  hiddenWardKeys: [],
  labelOverrides: {},
};

/**
 * Configurações padrão (sem userId)
 */
export const DEFAULT_SETTINGS: Omit<Settings, 'userId'> = {
  id: SETTINGS_ID,
  inputPreferences: { ...DEFAULT_INPUT_PREFERENCES },
  wardPreferences: { ...DEFAULT_WARD_PREFERENCES },
  updatedAt: new Date(),
};

/**
 * Cria configurações para um novo usuário
 */
export function createSettings(userId: string): Settings {
  return {
    ...DEFAULT_SETTINGS,
    inputPreferences: { ...DEFAULT_INPUT_PREFERENCES },
    wardPreferences: {
      hiddenWardKeys: [],
      labelOverrides: {},
    },
    userId,
    updatedAt: new Date(),
  };
}

function normalizeUpdatedAt(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const timestampLike = value as { toDate?: () => Date };
    if (typeof timestampLike.toDate === 'function') {
      const converted = timestampLike.toDate();
      if (!Number.isNaN(converted.getTime())) {
        return converted;
      }
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function normalizeInputPreferences(value: unknown): InputPreferences {
  const raw = value as Partial<InputPreferences> | undefined;

  return {
    uppercaseWard: raw?.uppercaseWard ?? DEFAULT_INPUT_PREFERENCES.uppercaseWard,
    uppercaseBed: raw?.uppercaseBed ?? DEFAULT_INPUT_PREFERENCES.uppercaseBed,
  };
}

function normalizeHiddenWardKeys(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];

  const keys = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeWardKey(item))
    .filter((item) => item.length > 0);

  return [...new Set(keys)];
}

function normalizeLabelOverrides(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const normalized: Record<string, string> = {};

  for (const [key, label] of Object.entries(raw)) {
    if (typeof label !== 'string') {
      continue;
    }

    const wardKey = normalizeWardKey(key);
    const wardLabel = normalizeWardLabel(label);

    if (!wardKey || !wardLabel) {
      continue;
    }

    normalized[wardKey] = wardLabel;
  }

  return normalized;
}

function normalizeWardPreferences(value: unknown): WardPreferences {
  const raw = value as Partial<WardPreferences> | undefined;

  return {
    hiddenWardKeys: normalizeHiddenWardKeys(raw?.hiddenWardKeys),
    labelOverrides: normalizeLabelOverrides(raw?.labelOverrides),
  };
}

/**
 * Normaliza payload parcial/legado para o shape atual de Settings
 */
export function normalizeSettings(raw: unknown, userId: string): Settings {
  const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;

  return {
    id: SETTINGS_ID,
    userId,
    inputPreferences: normalizeInputPreferences(rawObj.inputPreferences),
    wardPreferences: normalizeWardPreferences(rawObj.wardPreferences),
    updatedAt: normalizeUpdatedAt(rawObj.updatedAt),
  };
}
