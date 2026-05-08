# TrustCheck API — Sprint 1

Backend central da plataforma TrustCheck. Módulos **AUTH** e **CASOS** implementados nesta sprint.

## Estado real atual

- TC-S1-API-01 em andamento: contratos OpenAPI AUTH/CASOS consolidados como fonte oficial da semana.
- TC3-QA-08 concluída: plano E2E P0 da API documentado em `docs/qa/tc3-qa-08-e2e-plan.md`.

## Setup rápido

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais locais

# 3. Gerar Prisma Client
npm run prisma:generate

# 4. Criar banco e rodar migrations
npm run prisma:migrate:dev -- --name init

# 5. Iniciar em modo desenvolvimento
npm run start:dev
```

Acesso:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`

## Dependências de infra local

```bash
# PostgreSQL
docker run -d --name pg-trustcheck \
  -e POSTGRES_USER=trustcheck \
  -e POSTGRES_PASSWORD=senha \
  -e POSTGRES_DB=trustcheck_dev \
  -p 5432:5432 postgres:16

# Redis
docker run -d --name redis-trustcheck \
  -p 6379:6379 redis:7-alpine
```

## Estrutura de módulos

```text
src/
  main.ts                         # Bootstrap + Swagger
  app.module.ts                   # Módulo raiz
  prisma/                         # PrismaService global
  redis/                          # RedisService global
  auditoria/                      # AuditoriaService global (LGPD)
  auth/
    auth.controller.ts            # Endpoints REST de autenticação legados
    auth.service.ts               # Lógica de negócio AUTH legada
    auth.module.ts
    dto/auth.dto.ts
    strategies/                   # JWT + Google OAuth2
    guards/                       # JwtGuard + PerfisGuard
    decorators/                   # @Perfis()
  modules/
    auth/                         # Fluxos consumidor/empresa da Sprint 1
    cases/                        # Casos, transições e auditoria
    legal-terms/                  # Aceite legal e evidência LGPD
  common/
    audit/                        # Sanitização e auditoria compartilhada
    events/                       # Eventos de domínio versionados
    guards/                       # Roles/Internal guards
    validators/                   # Validadores de domínio
```

## Contratos oficiais da semana

A fonte oficial de contrato para a Sprint 1 fica nestes arquivos:

- OpenAPI AUTH: `docs/openapi/auth.yaml`
- OpenAPI CASOS: `docs/openapi/casos.yaml`
- Bundle OpenAPI consolidado: `openapi/openapi.yaml`
- Fluxos AUTH: `openapi/README-fluxos-auth.md`
- Eventos AUTH: `docs/events/auth.md`

### Escopo mínimo TC-S1-API-01

Os contratos devem refletir somente endpoints implementados ou explicitamente marcados como backlog futuro. Para a Sprint 1, o foco é:

- `POST /auth/consumer/register`
- `POST /auth/consumer/register/confirm`
- `POST /auth/company/register`
- `POST /auth/company/register/confirm`
- `POST /auth/company/claim`
- `GET /auth/company/claim/{claimId}/status`
- `POST /auth/sso/google`
- `POST /auth/sso/apple`
- `POST /cases`
- `GET /cases/{id}`
- `GET /cases/{id}/audit`
- `POST /cases/{id}/moderation/start`
- `POST /cases/{id}/moderation/approve`
- `POST /cases/{id}/moderation/reject`
- `POST /cases/{id}/notify-company`
- `POST /cases/{id}/company/respond`
- `POST /cases/{id}/resolve`
- `POST /cases/{id}/close-unresolved`

### Regras de segurança dos exemplos OpenAPI

- Não incluir OTP real em exemplos.
- Não incluir access token, refresh token, secrets ou recovery codes reais.
- Não expor `storageKey` de evidências.
- Minimizar dados pessoais em respostas de caso.
- Documentar erros de regra, autenticação e autorização com payload controlado.

## Validação local

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
```

Validação recomendada para contrato OpenAPI:

```bash
npx @hey-api/openapi-ts -i openapi/openapi.yaml -o /tmp/trustcheck-openapi-check
```

> Observação: este comando valida parse/consumo do bundle OpenAPI com a dependência já presente no projeto. Não substitui uma validação semântica completa de contratos, mas ajuda a detectar YAML inválido e referências quebradas.

## Telas cobertas nesta sprint

| Módulo | Telas |
|---|---|
| AUTH | M02, M03, M04, E01, E02, E03, W01 |
| CASOS | M08, M09, M10, M11, M12, M13, E05, W03, W07 |

## Pipeline de estados (imutável V1)

```text
ENVIADO → EM_MODERACAO → PUBLICADO → AGUARDANDO_RESPOSTA_EMPRESA
        → EM_NEGOCIACAO → RESOLVIDO | NAO_RESOLVIDO
```

## Testes E2E

```bash
# Mobile (requer API rodando)
cd ../Mobile-main
npx jest test/e2e/mobile-auth.e2e.spec.ts

# Admin-Web (requer admin seedado no banco)
cd ../Admin-Web-main
ADMIN_EMAIL=admin@test.com ADMIN_SENHA=Admin@123 \
npx jest test/e2e/admin-auth.e2e.spec.ts
```

## Conformidade LGPD/CDC

- Aceite do termo registra IP + data/hora + versão (`TermoAceite`).
- `AuditLog` captura ações sensíveis com `TipoAuditoria`.
- `TimelineCaso` é append-only por design.
- Controle de acesso por perfil (`CONSUMIDOR`/`EMPRESA`/`ADMIN`) em endpoints sensíveis.
- Logs, auditoria e contratos não devem expor senha, OTP, tokens, refresh tokens, secrets ou dados privados de evidências.

## Fonte de verdade funcional

- `TrustCheckApp/Docs`
- `Docs/docs/01-visao-produto-e-modulos.md`
- `Docs/docs/03-planejamento-sprints.md`
