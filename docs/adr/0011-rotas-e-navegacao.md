# ADR 0011: Rotas e navegação (Fases 2 e 3)

- **Estado:** Aceite (2026-10-14)
- **Data:** 2026-10-14
- **Atualiza:** [ADR 0002](0002-motor-de-rotas-valhalla.md) (forma de usar o Valhalla) e [ADR 0005](0005-custo-zero-execucao-local.md) (custo zero)

## Contexto

O utilizador quer calcular rotas e usar o Trajecto como guia de viagem no iPhone, a custo zero.
O ADR 0002 previa um Valhalla local em Docker. Isso não serve para testar no telemóvel:
o Vercel e o iPhone não chegam a um servidor que corre no computador de casa.

## Decisão

1. **Servidor de rotas:** o servidor público do Valhalla mantido pela FOSSGIS
   (`https://valhalla1.openstreetmap.de/route`), através de uma função própria no Vercel
   (`apps/web/api/route.ts`). A mesma função é usada em desenvolvimento pelo Vite.
   - A variável `ROUTER_UPSTREAM` permite trocar para um Valhalla próprio sem mudar código.
2. **A função valida e reconstrói cada pedido:** só POST com JSON, só pedidos da própria
   aplicação (`Sec-Fetch-Site`), no máximo 16 KB, 2 a 10 pontos dentro de Portugal, Açores,
   Madeira e Espanha, modos `auto`, `motorcycle`, `pedestrian` e `bicycle`, e só as opções
   `use_tolls`, `use_highways`, `use_ferry` e `shortest`. Não envia cookies nem cabeçalhos do
   visitante e as respostas não ficam em cache (`no-store`).
3. **Preferências de rota:** usamos `use_tolls`, `use_highways` e `use_ferry` com valor 0
   ("evitar"). Correção ao ADR 0002: as opções `exclude_*` são *hard exclusions*
   **experimentais** que exigem configuração no servidor; o servidor público não garante
   que as aceite. Por isso "evitar" é uma preferência, não uma garantia (está escrito na interface).
4. **Formato:** usamos o formato nativo do Valhalla (`directions_type: instructions`,
   `turn_lanes: true`, `language: pt-PT`), que já traz as frases faladas em pt-PT
   (`verbal_transition_alert_instruction`, `verbal_pre_transition_instruction`,
   `verbal_post_transition_instruction`). Não usamos o formato OSRM.
5. **Navegação própria** em `packages/core/src/navigation.ts` (sem dependências do browser):
   projeção da posição na rota, progresso, tempo e distância restantes, deteção de saída da
   rota (distância ou sentido contrário em várias posições seguidas), chegada, e avisos
   falados (aviso antecipado ~25 s antes, aviso imediato ~7 s antes, "Continue durante…").
6. **Recálculo** a partir da posição atual, com a direção do GPS, no máximo uma vez a cada
   15 s (respeita o limite do servidor público).
7. **No browser:** voz com a Web Speech API (vozes do próprio dispositivo), ecrã ligado com a
   Screen Wake Lock API, posição com `watchPosition` de alta precisão. Há um modo de
   **simulação** para testar sem sair de casa.
8. **Custo do combustível:** distância × consumo × preço, com valores indicativos
   editáveis (6,5 L/100 km carro, 4,5 L/100 km mota, 1,75 €/L). Não inclui portagens.

## Limitações e termos dos serviços (declarados ao utilizador)

- **Servidor público da FOSSGIS:** uso justo de 1 pedido por segundo por utilizador,
  sem garantia de disponibilidade nem de velocidade; não é para serviços com muitos
  utilizadores. Serve para uso pessoal. Fontes: discussão oficial do projeto
  (github.com/valhalla/valhalla/discussions/3373) e documentação do Valhalla.
- **Dados:** OpenStreetMap (ODbL), com a atribuição já visível no mapa e no menu "Sobre".
- **Sem trânsito ao vivo** nem velocidades históricas: os tempos são estimativas pela
  velocidade típica de cada estrada.
- **Sem limites de velocidade** nas respostas de rota (o Valhalla só os dá noutros serviços).
- **Sem preço de portagens:** só se indica que a rota tem portagens.
- **Alternativas:** o Valhalla não as calcula com paragens nem com hora marcada.
- **Mota:** o modo `motorcycle` está marcado como BETA na documentação do Valhalla.
- **iPhone:** o Safari suspende a página quando o ecrã é bloqueado ou a aplicação vai para
  segundo plano; a navegação só funciona com o Trajecto aberto e visível. Por isso pedimos
  ao sistema para manter o ecrã ligado (Screen Wake Lock, iOS 16.4+).
- **Privacidade:** os pontos da rota (incluindo a posição atual, quando usada) passam pela
  função no Vercel e chegam ao servidor da FOSSGIS, que vê o IP do Vercel e não o do
  utilizador. Durante a navegação, a posição só sai do dispositivo para recalcular a rota.

## Consequências

Positivas:

- Funciona no iPhone e no Android a custo zero, sem instalar servidores.
- A lógica de navegação está no `core`, testada sem browser, e pode ser reutilizada numa
  aplicação nativa no futuro.
- Trocar para um Valhalla próprio é uma variável de ambiente.

Negativas:

- Dependência de um serviço público sem garantias; se falhar, não há rotas.
- Sem trânsito, os tempos podem estar errados em hora de ponta.

## Alternativas consideradas

- **Valhalla próprio na nuvem:** gratuito só em planos com poucos recursos; o grafo de
  Portugal precisa de vários GB de disco e de RAM para ser criado. Fica para a Fase 7.
- **OSRM público (router.project-osrm.org):** só tem carro e as regras de uso proíbem uso
  pesado; sem frases faladas em pt-PT.
- **APIs comerciais (Google, Mapbox, HERE):** pagas a partir de certo volume e com termos
  que restringem guardar e mostrar resultados fora dos mapas delas.
