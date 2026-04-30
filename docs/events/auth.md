# Eventos de Domínio — AUTH (TC1-API-08)

> **⚠️ Eventos Redis NÃO substituem audit_log.**
> Para trilha legal (LGPD/CDC, defesa em disputas), sempre consultar
> `module_audit_logs` (tabela PostgreSQL) com `action = 'AUTH_LOGIN'`
> ou `action = 'AUTH_LOGIN_FAILED'`.
> Eventos Redis têm retenção curta e servem para analytics e notificações
> em tempo real — não são fonte de verdade forense.


## Envelope padrão

Todo evento publicado no stream Redis segue este envelope imutável:

```json
{
  "id": "<uuid-v4>",
  "type": "auth.login.succeeded.v1",
  "version": 1,
  "occurredAt": "2026-04-30T13:00:00.000Z",
  "producer": "api",
  "correlationId": "<uuid-v4>",
  "causationId": "<uuid-v4 | null>",
  "payload": { ... }
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID v4 | Identificador único do evento |
| `type` | string | Nome do evento com sufixo de versão |
| `version` | number | Versão do **schema do payload** |
| `occurredAt` | ISO 8601 | Timestamp UTC em que o evento ocorreu |
| `producer` | `"api"` | Sistema que produziu o evento |
| `correlationId` | UUID v4 | ID de correlação — propagar entre eventos da mesma operação |
| `causationId` | UUID v4 \| null | ID do evento causador, se houver |
| `payload` | object | Dados específicos do tipo de evento |

**Transport V1:** Redis Streams  
**Stream:** `trustcheck.events.auth.v1`  
**Consumer Group:** `integrations`  
**DLQ:** `trustcheck.events.auth.v1.dlq`

---

## Eventos

### `auth.login.succeeded.v1`

Publicado quando um usuário conclui o login com sucesso (via OTP confirm ou SSO).

**Ponto de publicação:** `ConsumerAuthService._issueTokens()`

```typescript
interface LoginSucceededPayload {
  userId: string;      // UUID do usuário autenticado
  role: string;        // 'consumer' | 'company' | 'admin'
  method: 'password' | 'sso' | 'biometry' | 'recovery';
  ip: string | null;   // IP da requisição (pode ser null em SSO indireto)
  userAgent: string | null;
}
```

**Restrições de segurança:** Nunca incluir senha, token JWT ou refresh token no payload.

---

### `auth.otp.sent.v1`

Publicado imediatamente após o código OTP ser gerado e entregue ao provedor de envio.

**Ponto de publicação:** `OtpService.generate()`

```typescript
interface OtpSentPayload {
  destinationMasked: string; // ex: "us**@domain.com" ou "+5511****1234"
  channel: 'sms' | 'email';
  purpose: 'register' | 'login' | 'recover';
}
```

**Restrições de segurança:** **Nunca incluir o código OTP** nem o destino completo.  
A função `maskDestination()` em `src/common/events/schemas/auth/otp-sent.ts` aplica a máscara.

---

### `auth.otp.verified.v1`

Publicado quando o código OTP é verificado com sucesso.

**Ponto de publicação:** `OtpService.verify(userId, code, purpose)` (após verificação bem-sucedida)

```typescript
interface OtpVerifiedPayload {
  userId: string | null; // null se verificação anônima (ex: reset de senha pré-auth)
  purpose: 'register' | 'login' | 'recover';
  success: true;         // sempre true — erros não geram este evento
  attempts: number;      // quantas tentativas foram feitas antes do sucesso
}
```

---

## Regras de versionamento

| Cenário | Ação |
|---|---|
| Adição de campo **opcional** | Incrementar `version` no payload, manter `v1` no `type` |
| Remoção ou renomeação de campo | Publicar `auth.<evento>.v2`, manter `v1` ativo por **mínimo 30 dias** |
| Breaking change no envelope | Criar novo stream `trustcheck.events.auth.v2` |
| Deprecação de `v1` | Anunciar com 30 dias de antecedência no CONTRIBUTING.md + README do Integrations |

**V2 quando há schema break** significa: se o Integrations não consegue parsear sem alterar código, é um schema break.

---

## Garantias

- **At-least-once delivery:** Redis Streams + XACK por mensagem processada.
- **DLQ:** Mensagens com payload inválido (falha de schema Zod) são enviadas para `trustcheck.events.auth.v1.dlq` com campos `reason`, `detail`, `originalMsgId`.
- **Imutabilidade:** Eventos jamais são re-publicados com conteúdo alterado. Correções são novos eventos.
- **Privacidade:** Nenhum segredo (OTP, senha, token) é publicado em evento. Destinos são mascarados antes de publicar.
