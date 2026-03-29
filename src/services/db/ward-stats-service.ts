/**
 * VisitaMed Ward Stats Service
 * Serviço para gerenciar estatísticas locais de alas
 */

import { db } from './dexie-db';
import {
  createWardStatId,
  normalizeWardKey,
  normalizeWardLabel,
  type WardStat,
} from '@/models/ward-stat';
import { getAuthState } from '@/services/auth/auth-service';

/**
 * Obtém o ID do usuário atual ou lança erro se não autenticado
 */
function requireUserId(): string {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado');
  }

  return user.uid;
}

/**
 * Registra uso de uma ala
 * Cria novo registro ou incrementa contador existente
 */
export async function recordWardUsage(ward: string): Promise<void> {
  const userId = requireUserId();
  const wardKey = normalizeWardKey(ward);

  if (!wardKey) {
    return; // Ignora ala vazia
  }

  const id = createWardStatId(userId, wardKey);
  const now = new Date();

  await db.transaction('rw', db.wardStats, async () => {
    const existing = await db.wardStats.get(id);

    if (existing) {
      // Incrementa contador, mantém label original
      await db.wardStats.update(id, {
        usageCount: existing.usageCount + 1,
        lastUsedAt: now,
        updatedAt: now,
      });
    } else {
      // Cria novo registro
      const wardLabel = normalizeWardLabel(ward);
      const newStat: WardStat = {
        id,
        userId,
        wardKey,
        wardLabel,
        usageCount: 1,
        lastUsedAt: now,
        updatedAt: now,
      };
      await db.wardStats.add(newStat);
    }
  });
}

/**
 * Obtém sugestões de alas ordenadas por frequência + recência
 * Se não há stats, retorna array vazio (para fallback na view)
 */
export async function getWardStatsSuggestions(): Promise<WardStat[]> {
  const userId = requireUserId();

  const stats = await db.wardStats
    .where('userId')
    .equals(userId)
    .toArray();

  if (stats.length === 0) {
    return [];
  }

  // Ordena: usageCount DESC, depois lastUsedAt DESC
  stats.sort((a, b) => {
    // Primeiro por frequência
    if (b.usageCount !== a.usageCount) {
      return b.usageCount - a.usageCount;
    }
    // Desempate por recência
    return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
  });

  return stats;
}

/**
 * Obtém sugestões de alas para o input
 * Inclui fallback para getUniqueWards() se não há stats
 */
export async function getWardSuggestions(): Promise<string[]> {
  const stats = await getWardStatsSuggestions();

  if (stats.length === 0) {
    // Fallback: será chamado pela view que também tem acesso a getUniqueWards
    return [];
  }

  return stats.map((s) => s.wardLabel);
}

/**
 * Limpa todas as estatísticas de alas do usuário
 */
export async function clearWardStats(userId: string): Promise<void> {
  await db.wardStats.where('userId').equals(userId).delete();
}
