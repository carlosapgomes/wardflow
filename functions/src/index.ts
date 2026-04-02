/**
 * WardFlow Cloud Functions
 * Slice S11A - Endpoint baseline autenticado para aceite de convite
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

interface AcceptInviteRequest {
  token: string;
}

interface AcceptInviteResponse {
  status: string;
  uid: string;
  tokenReceived: boolean;
}

/**
 * Endpoint autenticado para aceitar convite
 * Rota: POST /api/invites/accept
 *
 * Baseline (S11A): apenas valida auth e retorna status autenticado.
 * Lógica de aceite real fica em S11C.
 */
export const acceptInviteEndpoint = functions.https.onRequest(async (req, res) => {
  // CORS headers for OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).send();
    return;
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    res.set('Access-Control-Allow-Origin', '*');
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  // Validate Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const idToken = authHeader.slice(7);

  // Verify Firebase ID token
  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch {
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  // Validate request body
  const body = req.body as AcceptInviteRequest | undefined;
  if (!body || typeof body.token !== 'string' || body.token.trim() === '') {
    res.set('Access-Control-Allow-Origin', '*');
    res.status(400).json({ error: 'invalid-request' });
    return;
  }

  // Baseline response (no real accept logic yet)
  const response: AcceptInviteResponse = {
    status: 'authenticated',
    uid: decodedToken.uid,
    tokenReceived: true,
  };

  res.set('Access-Control-Allow-Origin', '*');
  res.status(200).json(response);
});
