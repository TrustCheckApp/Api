# TrustCheck API — Sprint 1

Backend central da plataforma TrustCheck. Módulos **AUTH** e **CASOS** implementados nesta sprint.

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

Acesse:
- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`

## Dependências de infra (Docker recomendado)

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

```
src/
  main.ts                     # Bootstrap + Swagger
  app.module.ts               # Módulo raiz
  prisma/                     # PrismaService global
  redis/                      # RedisService global
  auditoria/                  # AuditoriaService global (LGPD)
  auth/
    auth.controller.ts        # Endpoints REST de autenticação
    auth.service.ts           # Lógica de negócio AUTH
    auth.module.ts
    dto/auth.dto.ts
    strategies/               # JWT + Google OAuth2
    guards/                   # JwtGuard + PerfisGuard
    decorators/               # @Perfis()
  casos/
    casos.controller.ts       # Endpoints REST de casos
    casos.service.ts          # Wizard, pipeline, moderação
    casos.module.ts
    dto/casos.dto.ts
```

## Contratos e documentação

- OpenAPI AUTH: `docs/openapi/auth.yaml`
- OpenAPI CASOS: `docs/openapi/casos.yaml`
- Eventos de domínio: `Integrations/docs/eventos-dominio.yaml`

## Telas cobertas nesta sprint

| Módulo | Telas |
|--------|-------|
| AUTH | M02, M03, M04, E01, E02, E03, W01 |
| CASOS | M08, M09, M10, M11, M12, M13, E05, W03, W07 |

## Pipeline de estados (imutável V1)

```
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

- Aceite do termo registra IP + data/hora + versão (`TermoAceite`)
- `AuditLog` captura todas as ações sensíveis com `TipoAuditoria`
- `TimelineCaso` é append-only — imutável por design
- Controle de acesso por perfil (CONSUMIDOR/EMPRESA/ADMIN) em todos os endpoints

## Fonte de verdade funcional

- https://github.com/TrustCheckApp/Docs
- `Docs/docs/01-visao-produto-e-modulos.md`
- `Docs/docs/03-planejamento-sprints.md`
