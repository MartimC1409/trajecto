# ADR 0001: Cliente web primeiro (PWA)

- **Estado:** Proposto
- **Data:** 2026-10-14

## Contexto

O utilizador deu prioridade à web, tem nível técnico básico e não tem orçamento. O Trajecto vai ser usado também no telemóvel, no carro.

## Decisão

- **Tipo de cliente:** uma única aplicação web progressiva (PWA). É instalável no ecrã principal e o desenho parte do ecrã pequeno ("mobile first").
- **Tecnologias e versões verificadas a 2026-10-14:**

  | Componente | Versão |
  |---|---|
  | Vite | 8.3.4 |
  | `@vitejs/plugin-react` | 6.1.2 |
  | React e React DOM | 19.3.0 |
  | TypeScript | 6.0.3 |
  | `maplibre-gl` | 6.14.0 |
  | i18next | 26.4.4 |

- **App nativa:** a app Expo / React Native fica adiada para uma Fase 8, depois da Fase 7.

## Consequências

Positivas:

- Uma só base de código.
- Sem lojas de apps e sem taxas.
- Testes ponta a ponta com Playwright.
- Atualizações instantâneas.

Negativas, a confirmar no telemóvel do utilizador na Fase 3:

- A geolocalização exige HTTPS (ou `localhost`).
- A navegação exige o ecrã ligado (Screen Wake Lock API), com maior consumo de bateria.
- A voz pt-PT depende das vozes instaladas no sistema operativo (Web Speech API).
- As notificações push no iPhone só funcionam com a PWA instalada no ecrã principal.
- **Android Auto e CarPlay ficam fora do âmbito** enquanto não houver app nativa.

## Alternativas consideradas

- **Expo / React Native já na Fase 1:** rejeitada, por contrariar a prioridade à web e acrescentar complexidade (builds nativos, contas de programador).
- **Flutter Web:** rejeitada, porque desenha a interface num *canvas* (pior acessibilidade e SEO) e não partilha código TypeScript com o backend.
