/**
 * WardFlow Cloud Functions
 * Slice S11C - Lógica real de aceite por token no backend
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const firestore = admin.firestore();

type InviteRole = 'editor' | 'viewer';
type MemberStatus = 'active' | 'removed';

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

interface InviteRecord {
  id: string;
  visitId: string;
  role: InviteRole;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

function setCors(res: functions.Response): void {
  res.set('Access-Control-Allow-Origin', '*');
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

async function findInviteByToken(token: string): Promise<InviteRecord | null> {
  const snapshot = await firestore
    .collectionGroup('invites')
    .where('token', '==', token)
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
export const acceptInviteEndpoint = functions.https.onRequest(async (req, res) => {
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

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    setCors(res);
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const idToken = authHeader.slice(7);

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch {
    setCors(res);
    res.status(401).json({ error: 'unauthenticated' });
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

  try {
    const invite = await findInviteByToken(token);

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

    const status = await acceptMembership(invite.visitId, decodedToken.uid, invite.role);

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
