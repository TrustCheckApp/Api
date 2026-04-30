import { CaseStatus, ActorRole } from '@prisma/client';

export interface ActorInfo {
  id?: string;
  role: ActorRole;
  ip?: string;
}

export type TransitionKey = `${CaseStatus}->${CaseStatus}`;

export const TRANSITIONS: Record<CaseStatus, Set<CaseStatus>> = {
  [CaseStatus.ENVIADO]: new Set([CaseStatus.EM_MODERACAO]),
  [CaseStatus.EM_MODERACAO]: new Set([CaseStatus.PUBLICADO, CaseStatus.NAO_RESOLVIDO]),
  [CaseStatus.PUBLICADO]: new Set([CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA]),
  [CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA]: new Set([CaseStatus.EM_NEGOCIACAO, CaseStatus.NAO_RESOLVIDO]),
  [CaseStatus.EM_NEGOCIACAO]: new Set([CaseStatus.RESOLVIDO, CaseStatus.NAO_RESOLVIDO]),
  [CaseStatus.RESOLVIDO]: new Set(),
  [CaseStatus.NAO_RESOLVIDO]: new Set(),
};

export const ALLOWED_ACTORS: Partial<Record<TransitionKey, ActorRole[]>> = {
  [`${CaseStatus.ENVIADO}->${CaseStatus.EM_MODERACAO}`]: [ActorRole.system, ActorRole.admin],
  [`${CaseStatus.EM_MODERACAO}->${CaseStatus.PUBLICADO}`]: [ActorRole.admin],
  [`${CaseStatus.EM_MODERACAO}->${CaseStatus.NAO_RESOLVIDO}`]: [ActorRole.admin],
  [`${CaseStatus.PUBLICADO}->${CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA}`]: [ActorRole.system],
  [`${CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA}->${CaseStatus.EM_NEGOCIACAO}`]: [ActorRole.company],
  [`${CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA}->${CaseStatus.NAO_RESOLVIDO}`]: [ActorRole.system, ActorRole.admin],
  [`${CaseStatus.EM_NEGOCIACAO}->${CaseStatus.RESOLVIDO}`]: [ActorRole.system, ActorRole.admin],
  [`${CaseStatus.EM_NEGOCIACAO}->${CaseStatus.NAO_RESOLVIDO}`]: [ActorRole.admin, ActorRole.consumer],
};
