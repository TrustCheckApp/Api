# CONTRATOS - TC-S2-KICKOFF

## Status dos Endpoints

### AUTH - Autenticação

| Endpoint | Método | Status | Mock | Observações |
|----------|--------|--------|------|-------------|
| /auth/consumer/register | POST | ✅ Pronto | ✅ Disponível | Cadastro de consumidor |
| /auth/consumer/register/confirm | POST | ✅ Pronto | ✅ Disponível | Confirmação com OTP |
| /auth/company/register | POST | ✅ Pronto | ✅ Disponível | Cadastro empresarial |
| /auth/company/register/confirm | POST | ✅ Pronto | ✅ Disponível | Confirmação e enrolamento TOTP |
| /auth/company/claim | POST | ✅ Pronto | ✅ Disponível | Reivindicação por CNPJ |
| /auth/company/claim/{claimId}/status | GET | ✅ Pronto | ✅ Disponível | Status do claim |
| /auth/sso/google | POST | ✅ Pronto | ✅ Disponível | Login via Google SSO |
| /auth/sso/apple | POST | ✅ Pronto | ✅ Disponível | Login via Apple SSO |

### CASOS - Gestão de Casos

| Endpoint | Método | Status | Mock | Observações |
|----------|--------|--------|------|-------------|
| /cases | POST | ✅ Pronto | ✅ Disponível | Cria novo caso |
| /cases/{id} | GET | ✅ Pronto | ✅ Disponível | Busca caso por ID |
| /cases/{id}/audit | GET | ✅ Pronto | ✅ Disponível | Timeline de auditoria |
| /cases/{id}/moderation/start | POST | ✅ Pronto | ✅ Disponível | Inicia moderação |
| /cases/{id}/moderation/approve | POST | ✅ Pronto | ✅ Disponível | Aprova caso |
| /cases/{id}/moderation/reject | POST | ✅ Pronto | ✅ Disponível | Rejeita caso |
| /cases/{id}/notify-company | POST | ✅ Pronto | ✅ Disponível | Notifica empresa |
| /cases/{id}/company/respond | POST | ✅ Pronto | ✅ Disponível | Resposta da empresa |
| /cases/{id}/resolve | POST | ✅ Pronto | ✅ Disponível | Resolve caso |
| /cases/{id}/close-unresolved | POST | ✅ Pronto | ✅ Disponível | Fecha sem resolução |

### MIDIA - Upload de Evidências

| Endpoint | Método | Status | Mock | Observações |
|----------|--------|--------|------|-------------|
| /media/upload | POST | ⏳ Pendente | ❌ Não disponível | Upload de arquivos |

### NEGOC - Negociação

| Endpoint | Método | Status | Mock | Observações |
|----------|--------|--------|------|-------------|
| /cases/{id}/negotiation/start | POST | ⏳ Pendente | ❌ Não disponível | Inicia negociação |
| /cases/{id}/negotiation/accept | POST | ⏳ Pendente | ❌ Não disponível | Aceita proposta |
| /cases/{id}/negotiation/reject | POST | ⏳ Pendente | ❌ Não disponível | Rejeita proposta |

### MODERAÇÃO - Moderação Admin

| Endpoint | Método | Status | Mock | Observações |
|----------|--------|--------|------|-------------|
| /admin/cases/pending | GET | ⏳ Pendente | ❌ Não disponível | Lista casos pendentes |
| /admin/cases/{id}/moderate | POST | ⏳ Pendente | ❌ Não disponível | Moderação admin |

### AUDIT - Auditoria Legal

| Endpoint | Método | Status | Mock | Observações |
|----------|--------|--------|------|-------------|
| /cases/{id}/audit | GET | ✅ Pronto | ✅ Disponível | Timeline de auditoria |

## Legenda de Status

- ✅ Pronto: Endpoint implementado na API e mock disponível
- ⏳ Pendente: Endpoint ainda não implementado na API
- ❌ Quebrado: Endpoint com problemas ou mock não funcional

## Configuração de Mocks

### Mobile
```bash
EXPO_PUBLIC_USE_MOCKS=true|false
```

### Admin-Web
```bash
NEXT_PUBLIC_USE_MOCKS=true|false
```

## Como Usar

### Importar Tipos
```typescript
import { paths } from '@trustcheck/contracts/types';
```

### Importar Mocks
```typescript
import { allMocks } from '@trustcheck/contracts/mocks';
```

## Versionamento

- Versão atual: 1.1.1
- Fonte: openapi/openapi.yaml
- Gerado em: 2026-05-09
