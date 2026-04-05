/**
 * WardFlow Cloud Functions
 * Slice S11E - Hardening: token hash, rate-limit, auditoria
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';

/**
 * Gera hash SHA-256 hex de uma string
 */
function sha256Hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

admin.initializeApp();

const firestore = admin.firestore();

type InviteRole = 'editor' | 'viewer';
type MemberStatus = 'active' | 'removed';

// S11E: Rate limit config
const RATE_LIMIT_COOLDOWN_MS = 2000; // 2 segundos
const RATE_LIMIT_COLLECTION = '_inviteAcceptRateLimit';

type AcceptInviteBusinessStatus =
  | 'accepted'
  | 'already-member'
  | 'invite-not-found'
  | 'invite-expired'
  | 'invite-revoked'
  | 'access-revoked';

interface AcceptInviteRequest {
  token: string;
}

interface AcceptInviteResponse {
  status: AcceptInviteBusinessStatus;
  visitId?: string;
}

interface LeaveVisitRequest {
  visitId: string;
}

interface LeaveVisitResponse {
  status: 'left';
  visitId: string;
}

interface DeleteVisitRequest {
  visitId: string;
}

interface DeleteVisitResponse {
  status: 'deleted';
  visitId: string;
}

interface InviteRecord {
  id: string;
  visitId: string;
  role: InviteRole;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

function setCors(res: Response): void {
  res.set('Access-Control-Allow-Origin', '*');
}

async function authenticateRequest(req: Request, res: Response): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    setCors(res);
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }

  const idToken = authHeader.slice(7);

  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    setCors(res);
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
}

// S11E: Rate limit check por uid
async function checkRateLimit(userId: string): Promise<boolean> {
  const rateLimitRef = firestore.collection(RATE_LIMIT_COLLECTION).doc(userId);
  const now = Date.now();

  try {
    const docSnap = await rateLimitRef.get();

    if (docSnap.exists) {
      const lastAttempt = docSnap.data();
      const lastAttemptTime = lastAttempt?.['lastAttempt'] as number | undefined;

      if (lastAttemptTime && (now - lastAttemptTime) < RATE_LIMIT_COOLDOWN_MS) {
        return false; // Rate limited
      }
    }

    // Atualiza último timestamp
    await rateLimitRef.set({ lastAttempt: now }, { merge: true });
    return true;
  } catch {
    // Em caso de erro, permite tentativa
    return true;
  }
}

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function parseInviteRole(value: unknown): InviteRole | null {
  if (value === 'editor' || value === 'viewer') {
    return value;
  }

  return null;
}

async function findInviteByTokenHash(token: string): Promise<InviteRecord | null> {
  // S11E: busca por tokenHash, não token puro
  const tokenHash = sha256Hash(token);

  const snapshot = await firestore
    .collectionGroup('invites')
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const inviteDoc = snapshot.docs[0];
  const data = inviteDoc.data();

  const visitIdFromPath = inviteDoc.ref.parent.parent?.id;
  const visitId = typeof data['visitId'] === 'string' && data['visitId'].trim() !== ''
    ? data['visitId']
    : visitIdFromPath;

  if (!visitId) {
    return null;
  }

  const role = parseInviteRole(data['role']);
  if (!role) {
    throw new Error('invalid-invite-role');
  }

  return {
    id: inviteDoc.id,
    visitId,
    role,
    expiresAt: parseDate(data['expiresAt']),
    revokedAt: parseDate(data['revokedAt']),
  };
}

async function acceptMembership(visitId: string, userId: string, role: InviteRole): Promise<AcceptInviteBusinessStatus> {
  const memberRef = firestore.collection('visits').doc(visitId).collection('members').doc(userId);

  return firestore.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);

    if (memberSnap.exists) {
      const memberData = memberSnap.data();
      const status = memberData?.['status'] as MemberStatus | undefined;

      if (status === 'active') {
        return 'already-member';
      }

      if (status === 'removed') {
        return 'access-revoked';
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    transaction.set(memberRef, {
      id: `${visitId}:${userId}`,
      visitId,
      userId,
      role,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    return 'accepted';
  });
}

/**
 * Endpoint autenticado para aceitar convite
 * Rota: POST /api/invites/accept
 */
export const acceptInviteEndpointV2 = onRequest({ region: 'southamerica-east1' }, async (req: Request, res: Response) => {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).send();
    return;
  }

  if (req.method !== 'POST') {
    setCors(res);
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  const decodedToken = await authenticateRequest(req, res);
  if (!decodedToken) {
    return;
  }

  const body = req.body as AcceptInviteRequest | undefined;
  if (!body || typeof body.token !== 'string' || body.token.trim() === '') {
    setCors(res);
    res.status(400).json({ error: 'invalid-request' });
    return;
  }

  const token = body.token.trim();
  const now = new Date();

  // S11E: Rate limit check
  const canProceed = await checkRateLimit(decodedToken.uid);
  if (!canProceed) {
    setCors(res);
    res.status(429).json({ error: 'rate-limited' });
    return;
  }

  try {
    const invite = await findInviteByTokenHash(token);

    if (!invite) {
      const response: AcceptInviteResponse = { status: 'invite-not-found' };
      setCors(res);
      res.status(200).json(response);
      return;
    }

    if (invite.revokedAt) {
      const response: AcceptInviteResponse = {
        status: 'invite-revoked',
        visitId: invite.visitId,
      };
      setCors(res);
      res.status(200).json(response);
      return;
    }

    if (!invite.expiresAt || now > invite.expiresAt) {
      const response: AcceptInviteResponse = {
        status: 'invite-expired',
        visitId: invite.visitId,
      };
      setCors(res);
      res.status(200).json(response);
      return;
    }

    // S11E: auditoria de aceite
    const status = await acceptMembership(invite.visitId, decodedToken.uid, invite.role);

    // Se aceite bem-sucedido, atualiza convite com auditoria
    if (status === 'accepted') {
      const inviteRef = firestore.collection('visits').doc(invite.visitId).collection('invites').doc(invite.id);
      await firestore.runTransaction(async (transaction) => {
        const inviteSnap = await transaction.get(inviteRef);
        if (inviteSnap.exists) {
          const currentData = inviteSnap.data();
          const currentAcceptedCount = (currentData?.['acceptedCount'] as number) || 0;

          transaction.update(inviteRef, {
            acceptedCount: currentAcceptedCount + 1,
            lastAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastAcceptedByUserId: decodedToken.uid,
          });
        }
      });
    }

    const response: AcceptInviteResponse = {
      status,
      visitId: invite.visitId,
    };

    setCors(res);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error accepting invite:', error);
    setCors(res);
    res.status(500).json({ error: 'internal-error' });
  }
});

/**
 * Endpoint autenticado para sair de uma visita colaborativa
 * Rota: POST /api/visits/leave
 */
export const leaveVisitEndpointV2 = onRequest({ region: 'southamerica-east1' }, async (req: Request, res: Response) => {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).send();
    return;
  }

  if (req.method !== 'POST') {
    setCors(res);
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  const decodedToken = await authenticateRequest(req, res);
  if (!decodedToken) {
    return;
  }

  const body = req.body as LeaveVisitRequest | undefined;
  if (!body || typeof body.visitId !== 'string' || body.visitId.trim() === '') {
    setCors(res);
    res.status(400).json({ error: 'invalid-request' });
    return;
  }

  const visitId = body.visitId.trim();

  try {
    const memberRef = firestore.collection('visits').doc(visitId).collection('members').doc(decodedToken.uid);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      setCors(res);
      res.status(404).json({ error: 'membership-not-found' });
      return;
    }

    const memberData = memberSnap.data();
    if (!memberData || memberData['status'] !== 'active' || memberData['userId'] !== decodedToken.uid) {
      setCors(res);
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (memberData['role'] === 'owner') {
      setCors(res);
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await memberRef.update({
      status: 'removed',
      removedAt: now,
      updatedAt: now,
    });

    const response: LeaveVisitResponse = {
      status: 'left',
      visitId,
    };

    setCors(res);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error leaving visit:', error);
    setCors(res);
    res.status(500).json({ error: 'internal-error' });
  }
});

/**
 * Endpoint autenticado para excluir visita colaborativa para todos
 * Rota: POST /api/visits/delete
 */
export const deleteVisitEndpointV2 = onRequest({ region: 'southamerica-east1' }, async (req: Request, res: Response) => {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).send();
    return;
  }

  if (req.method !== 'POST') {
    setCors(res);
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  const decodedToken = await authenticateRequest(req, res);
  if (!decodedToken) {
    return;
  }

  const body = req.body as DeleteVisitRequest | undefined;
  if (!body || typeof body.visitId !== 'string' || body.visitId.trim() === '') {
    setCors(res);
    res.status(400).json({ error: 'invalid-request' });
    return;
  }

  const visitId = body.visitId.trim();

  try {
    const memberRef = firestore.collection('visits').doc(visitId).collection('members').doc(decodedToken.uid);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      setCors(res);
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const memberData = memberSnap.data();
    if (memberData?.['status'] !== 'active' || memberData?.['role'] !== 'owner') {
      setCors(res);
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const visitRef = firestore.collection('visits').doc(visitId);
    const visitSnap = await visitRef.get();
    if (!visitSnap.exists) {
      setCors(res);
      res.status(404).json({ error: 'visit-not-found' });
      return;
    }

    const visitData = visitSnap.data();
    if (visitData?.['mode'] !== 'group') {
      setCors(res);
      res.status(400).json({ error: 'invalid-visit-mode' });
      return;
    }

    const batchSize = 300;
    while (true) {
      const notesSnapshot = await firestore
        .collectionGroup('notes')
        .where('visitId', '==', visitId)
        .limit(batchSize)
        .get();

      if (notesSnapshot.empty) {
        break;
      }

      const batch = firestore.batch();
      for (const noteDoc of notesSnapshot.docs) {
        batch.delete(noteDoc.ref);
      }

      await batch.commit();
    }

    await firestore.recursiveDelete(visitRef);

    const response: DeleteVisitResponse = {
      status: 'deleted',
      visitId,
    };

    setCors(res);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error deleting visit:', error);
    setCors(res);
    res.status(500).json({ error: 'internal-error' });
  }
});
