/**
 * VisitaMed Visits Service
 * Serviço de persistência de visitas
 */

import { db } from './dexie-db';
import { createVisit, generatePrivateVisitName, getCurrentDate, type Visit } from '@/models/visit';
import { getAuthState } from '@/services/auth/auth-service';

/**
 * Obtém o ID do usuário atual ou lança erro se não autenticado
 */
function requireUserId(): string {
  const { user } = getAuthState();

  if (!user) {
    throw new Error('Usuário não autenticado. Faça login para criar visitas.');
  }

  return user.uid;
}

/**
 * Valida que a visita pertence ao usuário atual
 */
function validateOwnership(visit: Visit, userId: string): void {
  if (visit.userId !== userId) {
    throw new Error('Acesso negado: visita não pertence ao usuário atual');
  }
}

/**
 * Cria uma nova visita privada
 * O nome é gerado automaticamente se não fornecido
 */
export async function createPrivateVisit(namePrefix?: string): Promise<Visit> {
  const userId = requireUserId();
  const name = generatePrivateVisitName(namePrefix);
  const date = getCurrentDate();

  const visit = createVisit({
    userId,
    name,
    date,
    mode: 'private',
  });

  await db.visits.add(visit);

  return visit;
}

/**
 * Busca todas as visitas do usuário atual
 * Ordenadas por data descendente (mais recentes primeiro)
 */
export async function getAllVisits(): Promise<Visit[]> {
  const { user } = getAuthState();

  if (!user) {
    return [];
  }

  const visits = await db.visits
    .where('userId')
    .equals(user.uid)
    .reverse()
    .sortBy('date');

  return visits;
}

/**
 * Busca uma visita pelo ID
 * Valida que a visita pertence ao usuário atual
 */
export async function getVisitById(visitId: string): Promise<Visit | undefined> {
  const userId = requireUserId();

  const visit = await db.visits.get(visitId);

  if (!visit) {
    return undefined;
  }

  validateOwnership(visit, userId);

  return visit;
}
