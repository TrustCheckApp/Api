# Eventos de CASOS

Este documento descreve os eventos de domínio emitidos pelo módulo CASOS.

## Stream

```text
cases
```

## `case.status.changed.v1`

Emitido quando a state machine conclui uma transição válida de status de caso.

### Tipo

```text
case.status.changed.v1
```

### Versão

```text
1
```

### Quando dispara

Após:

1. validação da transição oficial;
2. validação do ator permitido;
3. validação de vínculo do ator com o caso, quando aplicável;
4. atualização do status do caso;
5. criação da timeline em `caseStatusTransition`;
6. gravação do audit log técnico `CASE_STATUS_TRANSITION`.

### Payload

```ts
interface CaseStatusChangedPayload {
  caseId: string;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
  actorRole: ActorRole;
  transitionId: string;
  occurredAt: string;
}
```

### Exemplo seguro

```json
{
  "id": "b2d63ab9-2e9d-4c7a-bb2a-f6dc32c2f0f4",
  "type": "case.status.changed.v1",
  "version": 1,
  "occurredAt": "2026-05-08T10:00:00.000Z",
  "producer": "api",
  "correlationId": "f9e8f708-56a9-4395-9613-ef225a8b43b5",
  "causationId": null,
  "payload": {
    "caseId": "00000000-0000-4000-a000-000000000001",
    "fromStatus": "PUBLICADO",
    "toStatus": "AGUARDANDO_RESPOSTA_EMPRESA",
    "actorRole": "system",
    "transitionId": "00000000-0000-4000-a000-000000000999",
    "occurredAt": "2026-05-08T10:00:00.000Z"
  }
}
```

## Garantias LGPD

O payload é mínimo e não inclui:

- descrição do caso;
- nome, e-mail, telefone ou identificador externo do consumidor;
- CNPJ, razão social ou dados privados da empresa;
- termo legal;
- evidências;
- documentos;
- IP;
- user-agent;
- payloads privados da negociação.

## Idempotência

Consumidores devem usar `payload.transitionId` como chave idempotente de processamento da transição.

## Compatibilidade

Durante a Sprint 1, a state machine também mantém a emissão interna legada:

```text
case.status.changed
```

Esse evento legado existe apenas para compatibilidade in-process. Novas integrações devem consumir `case.status.changed.v1`.

## Relação com timeline e auditoria

Cada evento versionado corresponde a uma linha persistida em:

```text
caseStatusTransition
```

e a um registro técnico em:

```text
moduleAuditLog.action = CASE_STATUS_TRANSITION
```

O evento não substitui a timeline nem a auditoria; ele serve para reação assíncrona e integração entre módulos.
