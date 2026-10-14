# Fases 2 e 3: rotas e navegação, verificação

Data: 2026-10-14.

Os resultados abaixo foram obtidos num ambiente Linux com Node.js 24.21.0 e pnpm 12.11.2.

## O que foi feito

- **Rotas (Fase 2):** carro, mota, a pé e bicicleta; partida na localização atual ou num local
  pesquisado; até 8 paragens; trocar partida e destino; até 2 rotas alternativas; evitar
  portagens, autoestradas ou ferries; caminho mais curto; partir ou chegar a uma hora;
  duração, distância, hora de chegada, portagens, ferry e custo estimado de combustível;
  lista de passos.
- **Navegação (Fase 3):** instruções por voz em pt-PT, seta da manobra e distância, faixas
  recomendadas, número da saída e direção, "Depois…" quando duas manobras estão perto,
  hora de chegada e tempo e distância restantes, mapa a seguir a posição e orientado na
  direção da viagem, botão "Recentrar", recálculo automático quando sai da rota, ecrã
  sempre ligado, simulação da viagem (1× ou 4×).
- **Definições:** voz ligada ou desligada; consumo do carro e da mota; preço do combustível.

Decisões, limites e termos dos serviços: [ADR 0011](../adr/0011-rotas-e-navegacao.md).

## Resultados automáticos

| Verificação | Comando | Resultado |
|---|---|---|
| Lint (ESLint) | `pnpm lint` | ✅ sem erros nem avisos |
| Formatação (Prettier) | `pnpm format:check` | ✅ |
| Tipos (TypeScript 6.0.3) | `pnpm typecheck` | ✅ |
| Testes unitários `@trajecto/core` | `pnpm test:coverage` | ✅ 118 testes; linhas 100 %, instruções 99,5 % (meta ≥80 %) |
| Testes unitários `@trajecto/web` | `pnpm test:coverage` | ✅ 162 testes; linhas 97,7 %, instruções 96 % (meta ≥70 %) |
| Build de produção | `pnpm build` | ✅ |
| Testes ponta a ponta: Chromium desktop e Android | `pnpm test:e2e` | ✅ 29 passaram, 1 ignorado de propósito (toque no desktop) |
| Acessibilidade WCAG 2.2 AA (axe-core) | incluído no `pnpm test:e2e` | ✅ 0 violações no painel de direções e no ecrã de navegação |
| CSP | incluído no `pnpm test:e2e` | ✅ 0 violações, incluindo o campo de data e hora (Chromium) |

Os testes ponta a ponta das rotas usam uma resposta do Valhalla gravada no formato oficial
(`apps/web/e2e/fixtures/valhalla.ts`) e posições GPS simuladas pelo Playwright.

### Não verificado aqui

- **Servidor real do Valhalla:** a rede deste ambiente bloqueia `valhalla1.openstreetmap.de`.
  O formato foi confirmado na documentação e no código-fonte do Valhalla 3.9.1. A verificação
  com o servidor real é o item 1 da lista abaixo.
- **Voz e ecrã ligado num telemóvel real:** dependem do sistema; só podem ser testados no iPhone.
- **Campo de data e hora no WebKit:** o teste é ignorado no WebKit até ser validado no CI.

## Lista de verificação manual (para fazeres tu, no iPhone)

Antes de começar: em **Definições → Privacidade e segurança → Serviços de localização →
Sites do Safari**, escolhe "Ao usar a app" e ativa "Localização exata".

1. [ ] Abrir o Trajecto, pesquisar um destino perto (por exemplo, um café) e tocar em
   **Direções**. Aceitar o pedido de localização. Aparecem 1 a 3 rotas em poucos segundos.
2. [ ] Trocar entre **Carro**, **Mota**, **A pé** e **Bicicleta**: a rota e o tempo mudam.
3. [ ] Em **Opções de rota**, ligar "Evitar portagens" numa viagem longa (por exemplo,
   Lisboa → Porto): a rota muda ou continua com a etiqueta "Com portagens" se não houver
   alternativa.
4. [ ] Tocar numa rota cinzenta no mapa: passa a ser a rota escolhida.
5. [ ] **Simular** e escolher **4×**: ouve-se "A iniciar a navegação" e as instruções;
   a seta anda pela rota; no fim aparece "Chegaste ao destino". Tocar em **Terminar**.
6. [ ] **Iniciar** a pé numa rua perto de casa:
   - a voz avisa antes de cada viragem;
   - o ecrã não se desliga sozinho;
   - virar para uma rua errada: ao fim de alguns segundos aparece "A recalcular a rota…"
     e surge uma rota nova;
   - arrastar o mapa com o dedo e depois tocar em **Recentrar**.
7. [ ] No menu, desligar **Instruções por voz** e mudar o **preço do combustível**:
   o custo na lista de rotas muda.
8. [ ] Rodar o telemóvel e usar o tema escuro: o texto continua legível.

Se não ouvires a voz, confirma o volume e o modo silencioso, e se há uma voz portuguesa em
**Definições → Acessibilidade → Conteúdo falado → Vozes**.

## Riscos conhecidos

- Se o servidor público da FOSSGIS estiver em baixo ou lento, aparece "O serviço de rotas
  está indisponível"; não há alternativa automática.
- No iPhone, bloquear o ecrã ou mudar de aplicação pausa a navegação (limite do Safari).
- Sem trânsito ao vivo: os tempos são estimativas.
