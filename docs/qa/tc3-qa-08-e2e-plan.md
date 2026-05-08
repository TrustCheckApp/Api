# TC3-QA-08 — Plano E2E P0 da API

## Objetivo

Garantir validação automatizada mínima para os fluxos críticos da Sprint 1 no repositório `Api`: AUTH, CASOS, Legal Terms, auditoria e OpenAPI.

## Fluxos críticos cobertos

- Auth consumidor/empresa: registro, confirmação OTP, claim e auditoria.
- Abertura de caso com termo legal versionado.
- Moderação e transições críticas de estado.
- Trilha de auditoria do caso.
- Parse do bundle OpenAPI consumível por Mobile/Admin-Web.

## Suite P0 priorizada

1. `test/auth/consumer-register.e2e-spec.ts`
2. `test/auth/company-register.e2e-spec.ts`
3. `test/auth/company-claim.e2e-spec.ts`
4. `test/cases/open-case.e2e-spec.ts`
5. `test/cases/state-machine.e2e-spec.ts`
6. `test/legal-terms/term-acceptance.e2e-spec.ts`

## Execução local recomendada

```bash
cp .env.test .env
docker compose -f docker-compose.test.yml up -d
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
npm run lint:check
npm run test
npm run openapi:check
npm run test:e2e:p0
```

## Execução completa E2E

```bash
npm run test:e2e
```

## Validação CI

O workflow `.github/workflows/api-ci.yml` executa:

1. PostgreSQL 16 e Redis 7 como services.
2. `npm ci`.
3. `npm run prisma:generate`.
4. `npm run prisma:migrate:deploy`.
5. `npm run build`.
6. `npm run lint:check`.
7. `npm run test -- --runInBand`.
8. `npm run openapi:check`.
9. `npm run test:e2e:p0`.

## Critérios de aceite

- 100% dos cenários P0 executam sem bloqueador.
- Transições inválidas retornam erro de regra.
- Fluxos de AUTH não regressam em stage.
- Caso + aceite legal não geram caso órfão.
- O bundle `openapi/openapi.yaml` é parseável.
- Logs, auditoria e relatórios não expõem senha, OTP, tokens, TOTP secret, recovery codes ou documentos completos.

## Troubleshooting

### Banco não conecta

```bash
docker compose -f docker-compose.test.yml ps
docker compose -f docker-compose.test.yml logs postgres
```

Confirme se `DATABASE_URL` aponta para `trustcheck_e2e`.

### Redis não responde

```bash
docker compose -f docker-compose.test.yml logs redis
redis-cli -p 6379 ping
```

### Migrations falham

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

Se o banco local estiver inconsistente, recrie o ambiente de teste:

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
npm run prisma:migrate:deploy
```

### OpenAPI parse falha

```bash
npm run openapi:check
```

Verifique referências quebradas e YAML inválido em `openapi/openapi.yaml` antes de regenerar SDKs.
