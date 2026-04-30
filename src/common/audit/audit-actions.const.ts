/**
 * @file audit-actions.const.ts
 * @description Constantes de action para module_audit_logs.
 *
 * ## Regra para adicionar novas actions
 * - PR separado com label `security` ou `audit`.
 * - Revisão de segundo engenheiro.
 * - Atualizar testes relevantes.
 * - Referenciar o ticket no commit.
 */
export const AuditAction = {
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  COMPANY_REGISTER_INITIATED: 'COMPANY_REGISTER_INITIATED',
  COMPANY_CLAIM_SUBMITTED: 'COMPANY_CLAIM_SUBMITTED',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
