# VisitaMed

PWA mobile-first para médicos registrarem notas transitórias durante rounds clínicos.

## Características

- ⚡ **Captura rápida** - Registre notas em segundos
- 📴 **Offline-first** - Funciona sem conexão
- 🔄 **Sincronização** - Sync automático com Firestore
- 📋 **Exportação** - Gere mensagens para repasse
- 🔐 **Login Google** - Autenticação simples

## Stack

- Vite + TypeScript
- Lit (Web Components)
- Dexie (IndexedDB)
- Firebase (Auth + Firestore)
- vite-plugin-pwa

## Desenvolvimento

### Instalação

```bash
npm install
```

### Rodar em desenvolvimento

```bash
npm run dev
```

### Build para produção

```bash
npm run build
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Formatação

```bash
npm run format
```

## Estrutura do Projeto

```
src/
├── components/     # Componentes Lit reutilizáveis
├── views/          # Telas da aplicação
├── services/       # Lógica de negócio
├── styles/         # CSS global e tokens
├── models/         # Tipos TypeScript
├── router/         # Roteamento SPA
├── config/         # Configurações
└── utils/          # Utilitários
```

## Configuração do Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com)
2. Ative Authentication com Google Sign-In
3. Crie um banco Firestore
4. Copie as credenciais para `src/config/env.ts`

## Deploy

### Produção

```bash
npm run build
firebase deploy
```

### Regras Firestore

```bash
firebase deploy --only firestore
```

Consulte o [Deploy Checklist](docs/deploy-checklist.md) para procedimentos operacionais completos.

## Licença

MIT
