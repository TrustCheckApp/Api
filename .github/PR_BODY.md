## 🎯 Tarefa
- **ID:** TC-S2-KICKOFF
- **Sprint:** 02 (08/05 a 15/05)
- **Prioridade:** P0
- **Story Points:** 8
- **Repositório:** Api

## 📝 Descrição
Setup e congelamento de contratos OpenAPI para Sprint 02. Cria pacote de contratos compartilhado com tipos TypeScript gerados automaticamente e mocks MSW tipados para desenvolvimento local.

## 🔧 Mudanças por commit
Listar cada commit em ordem cronológica com 1 linha explicativa:

- `chore(contracts): publica openapi.json congelado [TC-S2-KICKOFF]` — adiciona openapi.json versionado em packages/contracts.
- `docs(contracts): cria CONTRACTS.md com matriz de status [TC-S2-KICKOFF]` — documenta status de todos os endpoints por domínio.

## 📂 Arquivos impactados
Lista resumida agrupada por área:
- `packages/contracts/openapi.json` (novo)
- `packages/contracts/types/index.ts` (novo)
- `packages/contracts/mocks/auth.ts` (novo)
- `packages/contracts/mocks/cases.ts` (novo)
- `packages/contracts/mocks/index.ts` (novo)
- `CONTRACTS.md` (novo)

## ✅ Critérios de aceite (do prompt original)
Marcar cada checkbox conforme cumprido:
- [x] Schemas OpenAPI publicados em formato consumível (JSON versionado)
- [x] Tipos TypeScript gerados via openapi-typescript
- [x] Pacote packages/contracts criado com tipos e mocks
- [x] Mocks MSW tipados cobrindo AUTH e CASOS
- [x] CONTRACTS.md com matriz de status criado
- [ ] Flag USE_MOCKS configurada em Mobile (pendente)
- [ ] Flag USE_MOCKS configurada em Admin-Web (pendente)
- [ ] Mobile e Admin-Web importam tipos do mesmo pacote (pendente)
- [ ] npm run typecheck passa em ambos (pendente)

## 🧪 Como testar
Passos numerados que o revisor deve executar:
1. `npm install` na raiz do Api.
2. Verificar que `packages/contracts/types/index.ts` foi gerado corretamente.
3. Verificar que `packages/contracts/mocks/` contém mocks tipados.
4. Verificar que `CONTRACTS.md` lista todos os endpoints corretamente.

## 🔗 Dependências e Issues
- Depende de: TC-S1-API-01 a TC-S1-API-09 (contratos da Sprint 01).
- Bloqueia: TC-S2-MOB-01 a TC-S2-MOB-06, TC-S2-ADM-07 a TC-S2-ADM-10 (todos consomem estes contratos).
- Issue: N/A.

## 🚨 Riscos e pontos de atenção para o review
- Mudança afeta todos os repositórios downstream (Mobile e Admin-Web).
- Precisa ser integrada em Mobile e Admin-Web antes de considerar completa.
- Mocks MIDIA, NEGOC e MODERAÇÃO ainda pendentes (apenas AUTH e CASOS implementados).

## 📸 Evidências (quando aplicável)
N/A (tarefa de infraestrutura).

## ⛔ Não-merge
**Esta PR NÃO deve ser mergeada pelo autor.** Aguardando code review e aprovação humana.
