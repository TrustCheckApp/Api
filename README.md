# TrustCheck API

Backend central da plataforma TrustCheck.

## Estado atual (atualizado em 2026-05-14)
- API NestJS funcional com Prisma/PostgreSQL/Redis.
- Modulos novos ativos para auth/cases/legal terms.
- Modulos legados ainda ativos para compatibilidade.

## Situacao tecnica real
- Endpoints novos (Sprint 1) existem e estao em uso parcial pelo Mobile.
- Endpoints legados ainda sao usados pelo Admin-Web atual.
- Upload assinado de evidencias esta implementado em `/cases/:caseId/evidences/upload-url`.
- Swagger ativo em `/docs`.

## Riscos e gaps principais
1. Duplicidade de rotas e regras entre legado e novo.
2. Falhas em parte da suite de testes (`test:hotfixes`).
3. Script `openapi:check` precisa ajuste de configuracao.

## Proximas prioridades
1. Migrar consumidores para endpoints V2 e descontinuar legado com plano de sunset.
2. Corrigir testes de auth/auditoria e tornar suite obrigatoria no gate.
3. Corrigir validacao OpenAPI para manter contrato como gate confiavel.

## Setup rapido
```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run start:dev
```

## Comandos importantes
```bash
npm run build
npm run lint:check
npm run test
npm run test:e2e
```

## Contratos e referencia
- Bundle OpenAPI: `openapi/openapi.yaml`
- Docs de escopo: https://github.com/TrustCheckApp/Docs
