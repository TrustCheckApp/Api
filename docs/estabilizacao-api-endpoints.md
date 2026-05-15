# Estabilização da API — módulos canônicos e inventário de endpoints

## Contexto

Esta documentação registra a primeira etapa da estabilização da API com abordagem TDD.

A composição canônica da aplicação passa a ser `src/modules/*`, mantendo os diretórios legados apenas como compatibilidade temporária enquanto não houver plano específico de remoção física.

## Decisão arquitetural

### Estrutura canônica

- `src/modules/auth/consumer-auth.module.ts`
- `src/modules/auth/company/company-auth.module.ts`
- `src/modules/cases/cases.module.ts`
- `src/modules/legal-terms/legal-terms.module.ts`
- `src/common/audit/audit.module.ts`
- `src/common/events/events.module.ts`

### Estrutura depreciada

Os módulos abaixo deixam de ser importados por `src/app.module.ts`:

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
| POST | `/auth/company/claim` | `CompanyAuthController` | Pública no código atual | `POST /auth/company/claim` | Implementado com atenção de autorização |
| GET | `/auth/company/claim/:claimId/status` | `CompanyAuthController` | JWT | `GET /auth/company/claim/{claimId}/status` | Implementado |
| POST | `/auth/company/claim/:claimId/approve` | `CompanyAuthController` | JWT + `admin` | Admin recomendado | Implementado |
| POST | `/auth/company/claim/:claimId/reject` | `CompanyAuthController` | JWT + `admin` | Admin recomendado | Implementado |
| POST | `/cases` | `CasesController` | JWT + `consumer` | `POST /cases` | Implementado |
| GET | `/cases/:id` | `CasesController` | Pública no código atual | `GET /cases/{id}` | Implementado com atenção de exposição |
| GET | `/cases/:id/audit` | `CasesController` | JWT + `admin` ou `consumer` | `GET /cases/{id}/audit` | Implementado |
| POST | `/cases/:id/moderation/start` | `CasesController` | JWT + `admin` | `POST /cases/{id}/moderation/start` | Implementado |
| POST | `/cases/:id/moderation/approve` | `CasesController` | JWT + `admin` | `POST /cases/{id}/moderation/approve` | Implementado |
| POST | `/cases/:id/moderation/reject` | `CasesController` | JWT + `admin` | `POST /cases/{id}/moderation/reject` | Implementado |
| POST | `/cases/:id/notify-company` | `CasesController` | Internal HMAC | `POST /cases/{id}/notify-company` | Implementado |
| POST | `/cases/:id/company/respond` | `CasesController` | JWT + `company` | `POST /cases/{id}/company/respond` | Implementado |
| POST | `/cases/:id/resolve` | `CasesController` | JWT + `admin` | `POST /cases/{id}/resolve` | Implementado com divergência de regra V1 |
| POST | `/cases/:id/close-unresolved` | `CasesController` | JWT + `admin` ou `consumer` | `POST /cases/{id}/close-unresolved` | Implementado |
| POST | `/cases/:caseId/evidences` | `CaseEvidencesController` | JWT + `consumer` ou `company` | `POST /cases/{id}/evidences` | Implementado |
| POST | `/cases/:caseId/evidences/upload-url` | `CaseEvidencesController` | JWT + `consumer` ou `company` | Recomendado em MIDIA | Implementado |
| GET | `/cases/:caseId/evidences` | `CaseEvidencesController` | JWT + `consumer`, `company` ou `admin` | `GET /cases/{id}/evidences` | Implementado |
| POST | `/admin/legal-terms` | `LegalTermsController` | JWT + `admin` | Admin/legal recomendado | Implementado |
| GET | `/legal-terms/active` | `LegalTermsController` | Pública | Recomendado | Implementado |
| GET | `/admin/legal-terms/:version/acceptances` | `LegalTermsController` | JWT + `admin` | Admin/legal recomendado | Implementado |

## Divergências e riscos conhecidos

1. `POST /auth/company/claim` está público no controller canônico. A referência de Sprint 1 exige status autenticado, mas o claim em si pode exigir autenticação conforme decisão de produto. Recomenda-se fechar regra em teste antes de alterar comportamento.
2. `GET /cases/:id` está público no código atual. Isso pode ser aceitável apenas se retornar dados estritamente públicos e minimizados; caso contrário, deve exigir autorização.
3. `POST /cases/:id/resolve` está restrito a `admin`, enquanto a regra V1 indica resolução com confirmação de consumidor e empresa. A implementação atual exige flags de confirmação, mas o endpoint não está aberto aos dois perfis.
4. Os diretórios legados permanecem no repositório por segurança, mas não são mais parte da composição canônica da aplicação.

## Testes adicionados

- `test/architecture/canonical-modules.spec.ts`
  - Garante que `AppModule` usa módulos canônicos em `src/modules/*`.
  - Garante que módulos legados não são importados pela composição principal.
  - Garante presença de guards e roles em endpoints sensíveis de casos e evidências.

## Validação recomendada

```bash
npm run validate:ci
npm run test:e2e:p0
```

## Próximas tarefas recomendadas

1. Criar testes E2E específicos para autorização de `GET /cases/:id`, `POST /auth/company/claim` e `POST /cases/:id/resolve`.
2. Decidir regra final de exposição pública de casos.
3. Migrar imports internos remanescentes que ainda dependem de guards/DTOs legados.
4. Remover fisicamente diretórios legados somente após cobertura de testes e validação CI.
