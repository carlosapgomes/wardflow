/**
 * WardFlow Auth Service
 * Serviço de autenticação com Firebase (Google Login)
 */

import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseAuth, initializeFirebase } from './firebase';
import { clearLocalUserData } from '../db/dexie-db';

export type { User };

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

type AuthStateCallback = (state: AuthState) => void;

let currentState: AuthState = {
  user: null,
  loading: true,
  error: null,
};

const subscribers = new Set<AuthStateCallback>();
let unsubscribe: Unsubscribe | null = null;

/**
 * Inicializa o listener de autenticação
 */
export function initializeAuth(): void {
  initializeFirebase();
  const auth = getFirebaseAuth();

  if (!auth) {
    currentState = { ...currentState, loading: false };
    notifySubscribers();
    return;
  }

  if (unsubscribe) {
    unsubscribe();
  }

  unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      currentState = {
        user,
        loading: false,
        error: null,
      };
      notifySubscribers();
    },
    (error) => {
      currentState = {
        user: null,
        loading: false,
        error: error.message,
      };
      notifySubscribers();
    }
  );
}

/**
 * Subscribe para mudanças de estado de autenticação
 */
export function subscribeToAuth(callback: AuthStateCallback): () => void {
  subscribers.add(callback);
  // Notifica estado atual imediatamente
  callback(currentState);

  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Obtém o estado atual de autenticação
 */
export function getAuthState(): AuthState {
  return { ...currentState };
}

/**
 * Login com Google
 */
export async function signInWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();

  if (!auth) {
    throw new Error('Firebase não está configurado');
  }

  try {
    currentState = { ...currentState, loading: true, error: null };
    notifySubscribers();

    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);

    currentState = {
      user: result.user,
      loading: false,
      error: null,
    };
    notifySubscribers();

    return result.user;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao fazer login';
    currentState = {
      user: null,
      loading: false,
      error: message,
    };
    notifySubscribers();
    throw error;
  }
}

/**
 * Logout
 */
export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth();

  if (!auth) {
    throw new Error('Firebase não está configurado');
  }

  try {
    // Limpa dados locais antes de encerrar sessão (dispositivo compartilhado)
    await clearLocalUserData();

    await signOut(auth);
    currentState = {
      user: null,
      loading: false,
      error: null,
    };
    notifySubscribers();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao fazer logout';
    currentState = { ...currentState, error: message };
    notifySubscribers();
    throw error;
  }
}

/**
 * Cleanup do serviço de auth
 */
export function cleanupAuth(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  subscribers.clear();
}

/**
 * Notifica todos os subscribers
 */
function notifySubscribers(): void {
  for (const callback of subscribers) {
    callback(currentState);
  }
}
