# 🤝 HANDOFF — Slice 1 (pronto pra colar)

Você está trabalhando no projeto WardFlow.

Contexto:
WardFlow é um PWA mobile-first para médicos registrarem notas transitórias durante rounds clínicos.
Não é um prontuário. O foco é velocidade, simplicidade e uso offline.

O projeto já possui:
- Vite + TypeScript + Lit configurados
- Estrutura de pastas organizada
- App shell, header e roteamento funcionando
- Dashboard view básica
- Nova Nota view (placeholder)
- Design system com tokens CSS
- AGENTS.md com diretrizes

Agora vamos implementar o primeiro slice funcional de dados.

---

## 🎯 Objetivo do Slice

Permitir que o usuário:
- crie uma nova nota
- salve localmente (IndexedDB via Dexie)
- sem ainda listar no dashboard

---

## 🧱 Escopo

Implementar:
1. Modelo de dados (Note)
2. Configuração do Dexie
3. Serviço de persistência de notas
4. Formulário funcional em "Nova Nota"
5. Salvar nota no banco local
6. Redirecionar para dashboard após salvar

---

## 🚫 Fora de escopo

- NÃO listar notas ainda
- NÃO agrupar dados
- NÃO implementar exportação
- NÃO implementar Firebase
- NÃO implementar sync
- NÃO implementar edição
- NÃO implementar validação complexa

---

## 📦 1. Modelo de dados

Criar em `models/note.ts`:

```ts
export interface Note {
  id: string
  userId: string
  date: string
  ward: string
  bed: string
  reference?: string
  note: string
  createdAt: number
  expiresAt: number
  syncStatus: 'pending' | 'synced'
}
````

---

## 🗄️ 2. Dexie (IndexedDB)

Criar em `services/db/dexie-db.ts`:

* Configurar banco Dexie
* Nome: wardflow-db
* Tabela: notes

Campos indexados:

* id
* date
* ward
* createdAt

Inicialização simples, sem overengineering

---

## 🧠 3. Serviço de notas

Criar em `services/db/notes-service.ts`:

Função principal:

```ts
createNote(input)
```

Responsabilidades:

* gerar id (usar crypto.randomUUID)
* preencher createdAt
* calcular expiresAt (14 dias)
* definir syncStatus = "pending"
* salvar no Dexie

Manter função simples e síncrona/async clara

---

## 🧾 4. Formulário — Nova Nota

Editar `views/new-note-view.ts`

Campos:

* Ala / Setor (input texto)
* Leito (input texto)
* Referência (opcional)
* Nota (textarea)

Requisitos:

* layout mobile-first
* inputs grandes
* usar design tokens
* botão "Salvar"

---

## ⚙️ 5. Comportamento

Ao clicar em "Salvar":

* coletar dados do form
* chamar `createNote`
* navegar para "/dashboard"

Sem validação complexa:

* apenas garantir que ward, bed e note não estão vazios

---

## 🧭 6. Navegação

* após salvar → redirect para "/dashboard"

---

## 🎨 7. Estilo

Seguir design system:

* padding confortável
* inputs grandes
* botão primário visível
* layout simples

---

## 🧪 8. Qualidade

* TypeScript strict sem erros
* Código limpo e pequeno
* Sem abstrações desnecessárias
* Sem dependências novas

---

## 🧠 Observações importantes

* Não antecipar futuras features
* Não criar camada de repository complexa
* Não implementar sync
* Não adicionar estado global desnecessário
* Manter tudo direto e simples

---

## ✅ Resultado esperado

* Usuário entra em "/nova-nota"
* Preenche os campos
* Clica em salvar
* Nota é salva no IndexedDB
* App redireciona para dashboard
* Sem erros

---

Siga as diretrizes do AGENTS.md.

Implemente apenas o necessário para esse slice.

```

---
