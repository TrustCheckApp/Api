# README — Fluxos AUTH: OTP e 2FA

> Exemplos `curl` para os 4 fluxos definidos em `openapi.yaml` (seção `x-fluxos`).
> URL base: `http://localhost:3000` (ajuste para produção conforme necessário).

---

## Fluxo 1 — OTP no cadastro de consumidor

### Passo 1 — Solicitar envio do código

```bash
curl -s -X POST http://localhost:3000/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "finalidade": "CADASTRO"
  }'
```

**Resposta esperada (200):**
```json
{
  "mensagem": "Se o e-mail estiver cadastrado, você receberá um código em instantes.",
  "expiraEm": 300
}
```

**Erro — rate limit horário (429):**
```json
{
  "code": "OTP_RATE_LIMIT_HOURLY",
  "message": "Limite de envios por hora excedido. Tente novamente em 47 minutos.",
  "details": [{ "retryAfterSeconds": 2820 }],
  "traceId": "abc-124"
}
```

---

### Passo 2 — Verificar o código recebido

```bash
curl -s -X POST http://localhost:3000/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "codigo": "847291",
    "finalidade": "CADASTRO"
  }'
```

**Resposta esperada (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "perfil": "CONSUMIDOR"
}
```

**Erro — código expirado (401):**
```json
{
  "code": "OTP_EXPIRED",
  "message": "O código OTP expirou. Solicite um novo código.",
  "details": [],
  "traceId": "abc-127"
}
```

**Erro — máximo de tentativas (429):**
```json
{
  "code": "OTP_MAX_ATTEMPTS",
  "message": "Número máximo de tentativas excedido. O código foi invalidado. Solicite um novo.",
  "details": [{ "invalidatedAt": "2026-04-30T12:00:00Z" }],
  "traceId": "abc-130"
}
```

---

## Fluxo 2 — OTP para recuperação de senha

### Passo 1 — Solicitar código de redefinição

```bash
curl -s -X POST http://localhost:3000/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "finalidade": "RECUPERACAO_SENHA"
  }'
```

**Resposta esperada (200):**
```json
{
  "mensagem": "Se o e-mail estiver cadastrado, você receberá um código em instantes.",
  "expiraEm": 900
}
```

> Resposta genérica independente do e-mail existir ou não — previne enumeração de contas.

---

### Passo 2 — Verificar código e redefinir senha

```bash
curl -s -X POST http://localhost:3000/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "codigo": "391047",
    "finalidade": "RECUPERACAO_SENHA",
    "novaSenha": "NovaSenha@456"
  }'
```

**Resposta esperada (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440001",
  "perfil": "CONSUMIDOR"
}
```

> Todos os refresh tokens anteriores são revogados. O 2FA **permanece ativo** após a redefinição.

**Erro — nova senha sem campo obrigatório (422):**
```json
{
  "code": "REQUEST_INVALID",
  "message": "O campo 'novaSenha' é obrigatório para finalidade RECUPERACAO_SENHA.",
  "details": [{ "field": "novaSenha", "issue": "required_for_finalidade" }],
  "traceId": "abc-129"
}
```

---

## Fluxo 3 — Enrolamento 2FA TOTP (empresa / admin)

### Passo 1 — Fazer login e obter tokenTemporario

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "empresa@acme.com",
    "senha": "EmpresaSenh@99"
  }'
```

**Resposta — 2FA obrigatório (200):**
```json
{
  "requer2fa": true,
  "mensagem": "Informe o código 2FA para continuar.",
  "tokenTemporario": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWlkIiwidGVtcCI6dHJ1ZX0..."
}
```

---

### Passo 2 — Iniciar enrolamento (primeira vez)

```bash
curl -s -X POST http://localhost:3000/auth/2fa/totp/enroll \
  -H "Authorization: Bearer <tokenTemporario>" \
  -H "Content-Type: application/json" \
  -d '{ "confirmarEnrolamento": true }'
```

**Resposta esperada (201):**
```json
{
  "segredo": "JBSWY3DPEHPK3PXP",
  "qrCodeUrl": "data:image/png;base64,iVBORw0KGgo...",
  "otpauthUri": "otpauth://totp/TrustCheck:empresa%40acme.com?secret=JBSWY3DPEHPK3PXP&issuer=TrustCheck",
  "recoveryCodes": [
    "1234567890", "0987654321", "1122334455", "5544332211", "9988776655",
    "5566778899", "1357924680", "0246813579", "1928374650", "0564738291"
  ],
  "avisoUnicoExibicao": true
}
```

> ⚠️ Salve os recovery codes agora — **não serão exibidos novamente**.

---

### Passo 3 — Verificar primeiro código TOTP e obter JWT final

```bash
curl -s -X POST http://localhost:3000/auth/2fa/totp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "tokenTemporario": "eyJhbGciOiJIUzI1NiJ9...",
    "codigo": "123456"
  }'
```

**Resposta esperada (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440002",
  "perfil": "EMPRESA"
}
```

**Erro — replay attack (401):**
```json
{
  "code": "TOTP_REPLAY",
  "message": "Este código já foi utilizado. Aguarde o próximo ciclo de 30 segundos.",
  "details": [],
  "traceId": "abc-135"
}
```

**Erro — drift fora da tolerância (401):**
```json
{
  "code": "TOTP_DRIFT_OUT_OF_RANGE",
  "message": "Código fora da janela de tempo. Sincronize o relógio do dispositivo.",
  "details": [{ "driftDetectadoSegundos": 95 }],
  "traceId": "abc-136"
}
```

---

## Fluxo 4 — Fallback com Recovery Code

### Passo 1 — Usar recovery code quando TOTP indisponível

```bash
curl -s -X POST http://localhost:3000/auth/2fa/recovery/use \
  -H "Content-Type: application/json" \
  -d '{
    "tokenTemporario": "eyJhbGciOiJIUzI1NiJ9...",
    "recoveryCode": "1234567890"
  }'
```

**Resposta esperada (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440003",
  "perfil": "ADMIN",
  "aviso": "Você utilizou um recovery code. Recomendamos regenerar seus códigos de recuperação."
}
```

**Erro — código já utilizado (401):**
```json
{
  "code": "RECOVERY_CODE_USED",
  "message": "Este recovery code já foi utilizado e não pode ser reutilizado.",
  "details": [{ "usadoEm": "2026-04-29T10:00:00Z" }],
  "traceId": "abc-142"
}
```

**Erro — código inválido (401):**
```json
{
  "code": "RECOVERY_CODE_INVALID",
  "message": "Recovery code inválido.",
  "details": [],
  "traceId": "abc-141"
}
```

---

### Passo 2 — Regenerar recovery codes após uso

```bash
curl -s -X POST http://localhost:3000/auth/2fa/recovery/regenerate \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "senhaAtual": "MinhaSenh@123" }'
```

**Resposta esperada (200):**
```json
{
  "recoveryCodes": [
    "2837465019", "1029384756", "5647382910", "9102837465", "3748291056",
    "6510293847", "0182736495", "4956102837", "7364819205", "8201937465"
  ],
  "geradosEm": "2026-04-30T09:15:00Z",
  "avisoUnicoExibicao": true
}
```

> Os 10 recovery codes anteriores são invalidados imediatamente.

---

## Validação do contrato

Para validar o `openapi.yaml` localmente:

```bash
npx @redocly/cli lint openapi/openapi.yaml
```

Para visualizar no Redoc:

```bash
npx @redocly/cli preview-docs openapi/openapi.yaml
```

---

## Enum de códigos de erro

| Código | HTTP | Descrição |
|---|---|---|
| `OTP_EXPIRED` | 401 | Código OTP expirado |
| `OTP_INVALID` | 401 | Código OTP incorreto |
| `OTP_RATE_LIMIT_DESTINATION` | 429 | Destinatário bloqueado por 30 min |
| `OTP_RATE_LIMIT_HOURLY` | 429 | Limite de 3 envios/hora excedido |
| `OTP_MAX_ATTEMPTS` | 429 | 5 tentativas de validação excedidas |
| `TOTP_INVALID` | 401 | Código TOTP incorreto |
| `TOTP_REPLAY` | 401 | Código TOTP reutilizado na mesma janela |
| `TOTP_DRIFT_OUT_OF_RANGE` | 401 | Drift de relógio > ±1 janela (>±30s) |
| `RECOVERY_CODE_INVALID` | 401 | Recovery code não encontrado |
| `RECOVERY_CODE_USED` | 401 | Recovery code já utilizado |
| `ACCOUNT_LOCKED` | 429 | Conta bloqueada por excesso de tentativas |
| `REQUEST_INVALID` | 400/422 | Dados de entrada inválidos |

---

*Contrato: `openapi/openapi.yaml` — OpenAPI 3.1.0*
*Sprint 01 — TC1-API-02*
*Histórias cobertas: HU-AUTH-02, HU-AUTH-04, HU-AUTH-09, HU-AUTH-10, HU-AUTH-11*
