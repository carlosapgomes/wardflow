/**
 * VisitaMed Visit Expiration Utility
 * Funções puras para verificar expiração de visitas
 */

import type { Visit } from '@/models/visit';

/**
 * Verifica se uma visita está ativa (não expirada)
 *
 * Uma visita está ativa se: expiresAt > now
 * Uma visita está expirada se: expiresAt <= now
 */
export function isVisitActive(visit: Visit, now: Date = new Date()): boolean {
  return visit.expiresAt > now;
}

/**
 * Filtra apenas visitas ativas (não expiradas)
 */
export function filterActiveVisits(visits: Visit[], now: Date = new Date()): Visit[] {
  return visits.filter((visit) => isVisitActive(visit, now));
}
