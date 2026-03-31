# Deploy Checklist — VisitaMed

 checklist operacional para deploys em produção.

---

## 🚀 Deploy Padrão (sem breaking changes)

### 1. Validação local

```bash
# Tipocheck
npm run typecheck

# Lint
npm run lint

# Testes
npm test

# Build
npm run build
```

### 2. Deploy

```bash
# Deploy completo (hosting + firestore rules)
firebase deploy

# Ou se apenas regras mudaram
firebase deploy --only firestore
```

### 3. Verificação pós-deploy

- [ ] App carrega na URL de produção
- [ ] Login com Google funciona
- [ ] Criar nota → aparece no dashboard
- [ ] Exportar nota → mensagem gerada
- [ ] Offline: app funciona sem rede
- [ ] Ao reconectar: sync automático dispara

---

## 🔄 Deploy com Breaking Changes

### Pré-deploy

1. **Notifier users** (se houver mudança de comportamento)
2. **Backup Firestore** (opcional mas recomendado):
   ```bash
   gcloud firestore export gs://YOUR_BUCKET/backup-date
   ```

### Deploy

```bash
# Firestore rules primeiro (mais crítico)
firebase deploy --only firestore

# Hosting depois
firebase deploy --only hosting
```

### Rollback (se necessário)

```bash
# Rollback de regras Firestore
firebase deploy --only firestore --only older-version-tag

# Rollback de hosting
firebase deploy --only hosting --only older-version-tag
```

> **Nota**: Firebase Hosting não tem rollback automático. Use tags ou CI/CD com histórico.

---

## 🔒 Checklist de Segurança

### Regras Firestore

- [ ] `firestore.rules` compilam sem erro: `firebase firestore:rules:kill`
- [ ] Owner check em todas as operações
- [ ] Validação de campos mínimos (ward, bed, note, date)
- [ ] Limites de tamanho aplicados (note <= 2000, ward/bed <= 100)
- [ ] Coerência de IDs verificada (userId no doc == path, id == noteId)

### auth-service.ts

- [ ] Não expõe credenciais Firebase no frontend
- [ ] Usa apenas Auth do Firebase (não custom claims)

### Variáveis ambiente

- [ ] `.env` não está commitado
- [ ] `src/config/env.ts` usa variáveis via `import.meta.env`

---

## 🧪 Teste Manual Pós-Deploy

| Cenário | Esperado |
|---------|----------|
| Login pela primeira vez | Conta criada, redirect para dashboard |
| Criar nota | Nota aparece no dashboard |
| Editar nota | Alteração salva |
| Deletar nota | Nota removida |
| Logout | Redirect para login |
| Offline + criar nota | Salva no IndexedDB |
| Offline + reconectar | Sync dispara automaticamente |
| Usuário A tenta acessar nota de usuário B | Erro de permissão |

---

## 📊 Monitoramento

### Após deploy

- Firebase Console → Authentication → Users
- Firebase Console → Firestore → Data
- Firebase Console → Hosting → Analytics

### Logs de erro

```bash
firebase functions:log --only firestore
```

---

## 🔗 Links Úteis

- [Firebase Console](https://console.firebase.google.com/project/visitamed-36570)
- [Firebase Hosting](https://console.firebase.google.com/project/visitamed-36570/hosting)
- [Firebase Auth](https://console.firebase.google.com/project/visitamed-36570/authentication/users)

---

## 📝 Log de Deploy

| Data | Versão |Notas |
|------|--------|------|
| | | |
| | | |
| | | |

---

**Manutenção**: Atualize este checklist conforme o app evolve.
