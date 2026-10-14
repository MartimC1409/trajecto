# ADR 0006: Identidade: anónimo por omissão, conta opcional

- **Estado:** Proposto
- **Data:** 2026-10-14

## Contexto

O utilizador quer uso anónimo, com conta opcional. Os requisitos originais pedem OAuth2/OIDC.

## Decisão

- **Fases 1 a 4:** não há contas. Favoritos e histórico ficam no browser (IndexedDB), com opção de apagar tudo.
- **Identificador de instalação:** se for necessário, gera-se um identificador aleatório, sem ligação a dados pessoais.
- **Fase 5 (votos e reputação):** introduz-se a conta opcional por **OIDC, Authorization Code com PKCE**. O fornecedor é escolhido nessa fase.
- **Critérios para escolher o fornecedor:**
  - conformidade com OIDC;
  - custo zero;
  - dados alojados na UE;
  - possibilidade de associar o histórico anónimo à conta criada;
  - manutenção simples.
- **Candidatos:**
  - Keycloak 26.8.1 (Apache-2.0), em Docker local;
  - um serviço gerido com plano gratuito, com termos verificados na altura.

## Consequências

Positivas:

- Nenhum dado pessoal até à Fase 5.

Negativas:

- Sem conta não há sincronização entre dispositivos.
