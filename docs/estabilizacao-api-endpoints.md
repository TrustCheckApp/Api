# Estabilização da API — módulos canônicos e inventário de endpoints

## Contexto

Esta documentação registra a estabilização incremental da API com abordagem TDD.

A composição canônica da aplicação é `src/modules/*`, mantendo os diretórios legados apenas como compatibilidade temporária enquanto não houver plano específico de remoção física.

## Decisão arquitetural

### Estrutura canônica

- `src/modules/auth/consumer-auth.module.ts`
- `src/modules/auth/company/company-auth.module.ts`
- `src/modules/cases/cases.module.ts`
- `src/modules/legal-terms/legal-terms.module.ts`
- `src/common/audit/audit.module.ts`
- `src/common/events/events.module.ts`

### Estrutura depreciada

Os módulos abaixo não devem ser importados por `src/app.module.ts`:

- `src/auth/auth.module.ts`
- `src/casos/casos.module.ts`
- `src/auditoria/auditoria.module.ts`

Eles ainda não foram removidos fisicamente para evitar alteração destrutiva sem validação completa de dependências internas, guards, DTOs e possíveis imports transitivos.

## Inventário real de endpoints canônicos

Inventário extraído dos controllers atualmente registrados pela composição canônica.

| Método | Rota | Controller | Autorização atual | OpenAPI esperado | Status |
|---|---|---|---|---|---|
| GET | `/health` | `HealthController` | Pública | Não obrigatório | Implementado |
| POST | `/auth/consumer/register` | `ConsumerAuthController` | Pública | `POST /auth/consumer/register` | Implementado |
| POST | `/auth/consumer/register/confirm` | `ConsumerAuthController` | Pública | `POST /auth/consumer/register/confirm` | Implementado |
| POST | `/auth/consumer/login` | `ConsumerAuthController` | Pública | Não listado no Sprint 1 consolidado | Divergência documentada |
| POST | `/auth/sso/google` | `ConsumerAuthController` | Pública | `POST /auth/sso/google` | Implementado |
| POST | `/auth/sso/apple` | `ConsumerAuthController` | Pública | `POST /auth/sso/apple` | Implementado |
| POST | `/auth/company/register` | `CompanyAuthController` | Pública | `POST /auth/company/register` | Implementado |
| POST | `/auth/company/register/confirm` | `CompanyAuthController` | Pública | `POST /auth/company/register/confirm` | Implementado |
| POST | `/auth/company/claim` | `CompanyAuthController` | JWT + `company` | `POST /auth/company/claim` | Ajustado nesta etapa |
| GET | `/auth/company/claim/:claimId/status` | `CompanyAuthController` | JWT | `GET /auth/company/claim/{claimId}/status` | Implementado |
| POST | `/auth/company/claim/:claimId/approve` | `CompanyAuthController` | JWT + `admin` | Admin recomendado | Implementado |
| POST | `/auth/company/claim/:claimId/reject` | `CompanyAuthController` | JWT + `admin` | Admin recomendado | Implementado |
| POST | `/cases` | `CasesController` | JWT + `consumer` | `POST /cases` | Implementado |
| GET | `/cases/:id` | `CasesController` | JWT + `admin`, `consumer` ou `company` | `GET /cases/{id}` | Ajustado nesta etapa |
| GET | `/cases/:id/audit` | `CasesController` | JWT + `admin` ou `consumer` | `GET /cases/{id}/audit` | Implementado |
| POST | `/cases/:id/moderation/start` | `CasesController` | JWT + `admin` | `POST /cases/{id}/moderation/start` | Implementado |
| POST | `/cases/:id/moderation/approve` | `CasesController` | JWT + `admin` | `POST /cases/{id}/moderation/approve` | Implementado |
| POST | `/cases/:id/moderation/reject` | `CasesController` | JWT + `admin` | `POST /cases/{id}/moderation/reject` | Implementado |
| POST | `/cases/:id/notify-company` | `CasesController` | Internal HMAC | `POST /cases/{id}/notify-company` | Implementado |
| POST | `/cases/:id/company/respond` | `CasesController` | JWT + `company` | `POST /cases/{id}/company/respond` | Implementado |
| POST | `/cases/:id/resolve` | `CasesController` | JWT + `admin`, `consumer` ou `company`, com dupla confirmação | `POST /cases/{id}/resolve` | Ajustado nesta etapa |
| POST | `/cases/:id/close-unresolved` | `CasesController` | JWT + `admin` ou `consumer` | `POST /cases/{id}/close-unresolved` | Implementado |
| POST | `/cases/:caseId/evidences` | `CaseEvidencesController` | JWT + `consumer` ou `company` | `POST /cases/{id}/evidences` | Implementado |
| POST | `/cases/:caseId/evidences/upload-url` | `CaseEvidencesController` | JWT + `consumer` ou `company` | Recomendado em MIDIA | Implementado |
| GET | `/cases/:caseId/evidences` | `CaseEvidencesController` | JWT + `consumer`, `company` ou `admin` | `GET /cases/{id}/evidences` | Implementado |
| POST | `/admin/legal-terms` | `LegalTermsController` | JWT + `admin` | Admin/legal recomendado | Implementado |
| GET | `/legal-terms/active` | `LegalTermsController` | Pública | Recomendado | Implementado |
| GET | `/admin/legal-terms/:version/acceptances` | `LegalTermsController` | JWT + `admin` | Admin/legal recomendado | Implementado |

## Regras de autorização fechadas nesta etapa

### `POST /auth/company/claim`

- Exige JWT.
- Exige perfil `company`.
- Retorna `401` para chamada não autenticada.
- Retorna `403` para perfil diferente de empresa.
- Mantém payload mínimo e sem exposição de OTP, tokens ou documentos sensíveis.

### `GET /cases/:id`

- Passa a exigir JWT.
- Aceita perfis `admin`, `consumer` e `company`.
- Mantém retorno pelo service atual, mas a evolução recomendada é criar policy de vínculo ao caso para diferenciar consumidor dono, empresa vinculada e admin.
- A consulta pública anônima de caso publicado foi bloqueada nesta etapa por segurança, até haver policy explícita de payload público minimizado.

### `POST /cases/:id/resolve`

- Passa a aceitar `admin`, `consumer` e `company`.
- Mantém a regra de dupla confirmação: `consumerConfirmed` e `companyConfirmed` devem ser verdadeiros.
- Sem dupla confirmação, retorna conflito com `CASE_RESOLUTION_CONFIRMATION_REQUIRED`.

## Testes adicionados

- `test/architecture/canonical-modules.spec.ts`
  - Garante que `AppModule` usa módulos canônicos em `src/modules/*`.
  - Garante que módulos legados não são importados pela composição principal.
  - Garante presença de guards e roles em endpoints sensíveis de casos e evidências.

- `test/architecture/sensitive-endpoints-authorization.spec.ts`
  - Garante autenticação e perfil `company` em `POST /auth/company/claim`.
  - Garante autenticação e perfis autorizados em `GET /cases/:id`.
  - Garante autenticação, perfis autorizados e dupla confirmação em `POST /cases/:id/resolve`.

## Divergências e riscos conhecidos

1. `GET /cases/:id` agora exige autenticação. Caso o produto precise de página pública de caso publicado, deve ser criada rota separada ou policy explícita para payload público minimizado.
2. `POST /auth/company/claim` exige usuário `company`, mas o service ainda cria um novo usuário a partir do payload. A próxima etapa deve alinhar o fluxo funcional de claim autenticado para reutilizar o usuário autenticado ou separar `claim público` de `claim autenticado`.
3. A autorização por vínculo ao caso ainda precisa evoluir. Hoje os perfis permitidos são controlados por role; a checagem fina por dono/empresa vinculada deve ser implementada em policy dedicada.
4. Os diretórios legados permanecem no repositório por segurança, mas não são mais parte da composição canônica da aplicação.

## Validação recomendada

```bash
npm run validate:ci
npm run test:e2e:p0
npm test -- test/architecture/canonical-modules.spec.ts test/architecture/sensitive-endpoints-authorization.spec.ts
```

## Próximas tarefas recomendadas

1. Criar policy de acesso a caso: admin, consumidor dono e empresa vinculada.
2. Alinhar funcionalmente o fluxo de `POST /auth/company/claim` autenticado para não criar usuário duplicado.
3. Criar rota pública separada para caso publicado, se o produto exigir exposição pública.
4. Remover fisicamente diretórios legados somente após cobertura de testes e validação CI.
