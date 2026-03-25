/**
 * WardFlow Environment Configuration
 * Configurações de ambiente e Firebase
 */

export const config = {
  firebase: {
    apiKey: 'AIzaSyA9ck7Y8FJLqELw6UR1jcmEF7gBF_d6cQs',
    authDomain: 'wardflow-app.firebaseapp.com',
    projectId: 'wardflow-app',
    storageBucket: 'wardflow-app.firebasestorage.app',
    messagingSenderId: '470246924092',
    appId: '1:470246924092:web:b1b25df15b77a40ee64839',
    measurementId: 'G-3F0QSRQ7LF',
  },
  app: {
    name: 'WardFlow',
    version: '0.1.0',
    noteExpirationDays: 14,
  },
} as const;

/**
 * Valida se as configurações do Firebase foram preenchidas
 */
export function isFirebaseConfigured(): boolean {
  const { firebase } = config;
  return Boolean(firebase.apiKey && firebase.projectId);
}
