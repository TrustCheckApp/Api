# TC-S3-QA-08 — Relatorio semanal E2E Sprint 03

## Objetivo
Montar a suite E2E semanal da Sprint 03 no repositorio `TrustCheckApp/Api`, cobrindo fluxos criticos de autenticacao, aceite legal, empresa/claim, criacao de caso, transicoes oficiais e cenarios de erro.

## Comando de execucao
```bash
npm run test:e2e:weekly
```

## Pre-condicoes locais
```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
```

O ambiente E2E deve apontar para banco e Redis de teste. Em CI, usar `DATABASE_URL` e `REDIS_URL` isolados.

## Fluxos cobertos
- Cadastro consumidor: `test/auth/consumer-register.e2e-spec.ts`.
- Login/autenticacao: `test/auth/consumer-login-audit.e2e-spec.ts` e confirmacao OTP do cadastro consumidor.
- Aceite de termo legal: `test/legal-terms/term-acceptance.e2e-spec.ts`.
- Empresa/claim: `test/auth/company-claim.e2e-spec.ts`.
- Criar caso: `test/cases/open-case.e2e-spec.ts`.
- Transicoes oficiais de caso: `test/cases/state-machine.e2e-spec.ts`.
- Evidencia e cobertura semanal: `test/e2e-weekly/weekly-suite.e2e-spec.ts`.

## Cenarios de erro cobertos
- Cadastro consumidor sem LGPD aceita.
- Cadastro consumidor com e-mail duplicado.
- Confirmacao OTP invalida.
- Login com credenciais invalidas.
- Claim sem documentos.
- Claim com CNPJ invalido.
- Acesso de claim sem autenticacao.
- Usuario company tentando aprovar claim.
- Claim inexistente.
- Claim ja revisado.
- Rejeicao de claim sem motivo valido.
- Criacao de caso sem autenticacao ou por role invalida.
- Empresa inexistente ao criar caso.
- Termo legal com hash divergente.
- Termo legal inativo.
- Transicao de caso invalida.
- Empresa sem vinculo tentando responder caso.
- Assinatura interna invalida em notificacao de empresa.

## Fixtures sem PII real
- `test/fixtures/weekly-e2e.fixtures.ts` concentra dados sinteticos.
- Dominios de teste usam `trustcheck.test`.
- Nomes usam marcadores sinteticos de QA.
- Documentos de claim usam URL de stub `https://storage.trustcheck.test`.
- Nao usar CPF, telefone, e-mail pessoal, documento real ou arquivo real de cliente.

## Evidencias para review
- Resultado do comando `npm run test:e2e:weekly`.
- Logs do CI com banco/Redis de teste.
- Diff dos arquivos de teste e fixtures.
- Auditorias geradas nos testes sem tokens, OTP, senha, TOTP secret ou documentos completos.

## Falhas conhecidas
- `npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/e2e-weekly/weekly-suite.e2e-spec.ts`: passou com 3 testes.
- `npm run test:e2e:weekly -- --runTestsByPath test/e2e-weekly/weekly-suite.e2e-spec.ts`: executa a lista completa definida no script e ainda depende de PostgreSQL/Redis de teste para specs de auth/cases/legal-terms.
- A suite nao deve apontar para stage/producao.
- Alguns fluxos existentes ainda exercitam banco real de teste em vez de mocks in-memory.
- `npm ci` reportou vulnerabilidades no lockfile existente; nao foi executado `npm audit fix` para evitar alteracoes de dependencia fora do escopo.

## Riscos restantes
- Flakiness se o banco local nao estiver migrado ou isolado.
- Dados residuais podem afetar unicidade se a limpeza dos testes falhar.
- Contratos mobile/admin devem validar se a ordem de execucao semanal atende aos gates de release.
- Cobertura de provedores externos deve continuar stubada para evitar envio real de OTP/e-mail.

## Checklist antes do merge
- [ ] Rodar `npm run test:e2e:weekly` em ambiente limpo.
- [ ] Confirmar que `DATABASE_URL` e `REDIS_URL` apontam para recursos de teste.
- [ ] Verificar que logs nao expõem token, senha, OTP, TOTP secret ou recovery codes.
- [ ] Confirmar que fixtures nao possuem PII real.
- [ ] Revisar falhas conhecidas no pipeline antes de promover a release.
