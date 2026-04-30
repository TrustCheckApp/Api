# TC3-QA-08 - Plano E2E P0 (Api)

## Fluxos criticos cobertos
- Auth consumidor/empresa (registro, confirmacao OTP, claim)
- Abertura de caso com termo legal
- Moderacao e transicoes criticas de estado
- Trilha de auditoria do caso

## Suite priorizada
1. `test/auth/consumer-register.e2e-spec.ts`
2. `test/auth/company-register.e2e-spec.ts`
3. `test/auth/company-claim.e2e-spec.ts`
4. `test/cases/open-case.e2e-spec.ts`
5. `test/cases/state-machine.e2e-spec.ts`
6. `test/legal-terms/term-acceptance.e2e-spec.ts`

## Critérios de aceite
- 100% dos cenarios P0 executam sem bloqueador.
- Transicoes invalidas retornam erro de regra.
- Fluxos de auth nao regressam em stage.
