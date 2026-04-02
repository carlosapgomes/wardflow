# S11A - Endpoint de Aceite de Convite (Baseline)

## Endpoint

```
POST /api/invites/accept
```

## Autenticação

Requer Firebase ID Token no header `Authorization`:

```
Authorization: Bearer <idToken>
```

## Request Body

```json
{
  "token": "convite-token-aqui"
}
```

## Response (baseline)

```json
{
  "status": "authenticated",
  "uid": "usuario-uid",
  "tokenReceived": true
}
```

## Erros

| Status | Descrição |
|--------|-----------|
| 401 | Não autenticado ou token inválido |
| 400 | Request inválido (body sem token) |
| 405 | Método não permitido (não-POST) |

## Exemplo de uso (curl)

```bash
curl -X POST "https://seu-projeto.web.app/api/invites/accept" \
  -H "Authorization: Bearer $(firebase auth:print-id-token)" \
  -H "Content-Type: application/json" \
  -d '{"token": "convite-token-aqui"}'
```

## Escopo

Este slice (S11A) implementa apenas a infraestrutura autenticada baseline.
- Lógica real de aceite: S11C
- Frontend usa endpoint: S11D
