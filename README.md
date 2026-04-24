# TrustCheck API

Backend central da plataforma TrustCheck, responsavel por regras de negocio, seguranca, fluxo de casos e integracao entre dominios.

## Escopo V1
- AUTH: login OTP, SSO, 2FA e gestao de perfis.
- CASOS: criacao de denuncia, timeline e pipeline de status.
- MIDIA: validacao de anexos e orquestracao com storage.
- NEGOC: proposta, contraproposta, aceitar e recusar.
- TRUST: calculo de score e gestao de selos.
- ACADEMY: suporte a conteudo educacional e busca.

## Fora de escopo V1
- Pagamentos e assinatura premium.
- Integracao juridica avancada.
- Features de videochamada.

## Contratos esperados (documentais)
- API REST para operacoes transacionais.
- Eventos/atualizacoes de status por canal realtime.
- Registro auditavel para moderacao e termo legal.

## Dependencias
- Infra para ambientes, deploy e observabilidade.
- Integrations para OTP, email, IA, analytics e push.
- Mobile e Admin-Web como consumidores das capacidades de negocio.

## Fonte de verdade funcional
- https://github.com/TrustCheckApp/Docs
- `Docs/docs/01-visao-produto-e-modulos.md`
- `Docs/docs/03-planejamento-sprints.md`
