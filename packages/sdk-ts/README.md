# TrustCheck SDK TypeScript

SDK TypeScript gerado a partir do contrato oficial `openapi/openapi.yaml`.

## Fonte de verdade

- Contrato consumível: `../../openapi/openapi.yaml`
- Gerador: `@hey-api/openapi-ts`
- Cliente HTTP: `@hey-api/client-fetch`

## Comandos

Executar a partir da raiz do repositório `Api`:

```bash
npm run openapi:check
npm run sdk:generate
npm run sdk:build
```

Ou diretamente no workspace:

```bash
npm run check --workspace=packages/sdk-ts
```

## Consumo em Mobile/Admin-Web

O pacote gera tipos e funções em `dist/` após `npm run sdk:build`.

Uso esperado pelos clientes:

```ts
import { client } from '@trustcheck/sdk-ts';

client.setConfig({
  baseUrl: process.env.API_URL ?? 'http://localhost:3000',
});
```

Cada aplicação cliente deve configurar `baseUrl` por ambiente. Não há URL de produção hardcoded no SDK.

## Segurança

Os tipos gerados podem representar campos sensíveis de AUTH e 2FA. Clientes não devem logar, persistir indevidamente ou enviar para analytics:

- OTP;
- `registrationToken`;
- `accessToken`;
- `refreshToken`;
- `idToken` SSO;
- `totpSecret`;
- `qrCodeDataUrl`;
- `recoveryCodes`;
- documentos ou evidências privadas.

## Regra de manutenção

Sempre que `openapi/openapi.yaml` mudar, executar:

```bash
npm run openapi:check
npm run sdk:generate
npm run sdk:build
```

O CI da API também valida geração e build do SDK para evitar divergência entre contrato e clientes.
