# Fase 5: reportes e radares, verificação

Data: 2026-10-15.

Os resultados abaixo foram obtidos num ambiente Linux com Node.js 24.21.0 e pnpm 12.11.2.
Decisões, licenças e limites: [ADR 0013](../adr/0013-reportes-locais-e-radares.md).

## Correção: não era possível iniciar a rota no iPhone

Duas causas, ambas corrigidas:

1. **O botão "Iniciar" ficava escondido.** Num ecrã de iPhone o painel de direções é baixo e o
   botão ficava ~170 px abaixo do fundo do ecrã; só aparecia deslizando dentro do painel. Agora
   "Iniciar" e "Simular" ficam **sempre visíveis no fundo do painel**, com a duração e a
   distância da rota escolhida ao lado. Um teste ponta a ponta confirma que o botão está
   inteiramente visível sem deslizar (desktop, Android e iPhone).
2. **Dentro de casa, a navegação ficava parada em "À espera do sinal de GPS…".** Posições com
   precisão pior do que 80 m são ignoradas (seguir a rota com elas daria instruções erradas), mas
   isso não era dito. Agora aparece "Sinal de GPS fraco (precisão de ±150 m)…", a tua posição
   aproximada aparece no mapa e a navegação começa sozinha quando o sinal melhora. Parado, um
   "tempo esgotado" do GPS logo a seguir a uma posição já não mostra "Sem sinal de GPS".

Também foi confirmado que os serviços reais funcionam com o código das funções do Vercel
(workflow "Serviços reais" no GitHub Actions, 2026-10-15): Lisboa → Porto de carro com 3 rotas
(315,6 km, 319,6 km e 332,3 km), a pé, de bicicleta, de mota com paragem e hora marcada, e
meteorologia para 3 pontos. O workflow volta a correr todas as segundas-feiras.

## O que foi feito

- **Reportar:** polícia, acidente, perigo na via, trânsito parado, obras e estrada cortada.
  Durante a navegação (botão "Reportar") ou num ponto do mapa ("Reportar aqui").
- **No mapa:** cada reporte tem um ícone; ao tocar, mostra a hora, quando desaparece e os botões
  "Ainda lá está" (volta a contar o tempo) e "Já não está" (apaga).
- **Avisos na navegação:** reportes e radares em cima da rota aparecem a partir de 2 km e são
  ditos em voz alta uma vez (com o limite de velocidade, quando o radar o tem).
- **Radares fixos:** do OpenStreetMap (ODbL), atualizados uma vez por mês por um workflow do
  GitHub Actions. Interruptor "Avisar radares fixos" no menu. Primeira extração (2026-10-15):
  **341 radares** (300 nós `highway=speed_camera` e 41 relações de fiscalização), 292 com limite
  de velocidade e 56 com direção. Nenhuma relação estava marcada como velocidade média
  (`average_speed`), por isso esses troços aparecem como radares normais ou não aparecem.
- **Definições:** mostrar e avisar reportes de polícia (ligado), radares fixos (ligado) e
  "Apagar todos os reportes".
- **Privacidade:** os reportes ficam só neste dispositivo; nada é enviado para servidores.

O que **não** foi feito, e porquê (ADR 0013): partilha de reportes entre pessoas (precisa de um
servidor e da revisão legal do ADR 0008) e a lista oficial da ANSR (os termos não permitem a
reutilização sem autorização escrita).

## Resultados automáticos

| Verificação | Comando | Resultado |
|---|---|---|
| Lint, formatação e tipos | `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | ✅ |
| Testes unitários `@trajecto/core` | `pnpm test:coverage` | ✅ 161 testes; linhas 99,6 % |
| Testes unitários `@trajecto/web` | `pnpm test:coverage` | ✅ 203 testes (+3 contra serviços reais, à parte); linhas 97,9 % |
| Build de produção | `pnpm build` | ✅ |
| Testes ponta a ponta (desktop e Android, Chromium) | `pnpm test:e2e` | ✅ 31 testes |
| Testes ponta a ponta no iPhone (WebKit) | CI no GitHub Actions | ver o CI do commit |
| Serviços reais (Valhalla e Open-Meteo) | workflow "Serviços reais" | ✅ |

## Lista de verificação manual (no iPhone)

Correção do arranque:

1. [ ] Pedir direções para um local: os botões **Iniciar** e **Simular** aparecem no fundo do
   painel, com a duração e a distância, sem deslizar.
2. [ ] Dentro de casa, tocar em **Iniciar**: aparece o ecrã de navegação; se o GPS estiver fraco,
   aparece "Sinal de GPS fraco (precisão de ±… m)" em vez de ficar só "À espera…".
3. [ ] Na rua (ou à janela), a navegação arranca: distância até à manobra e hora de chegada.

Reportes e radares:

4. [ ] Pedir direções por uma estrada onde saibas que há um radar fixo e tocar em **Simular**:
   perto do radar aparece "Radar fixo a … m" (com o limite, quando o OSM o tem).
5. [ ] No mapa, tocar num ponto → **Reportar aqui** → **Obras**: aparece o ícone no mapa.
6. [ ] Tocar no ícone → **Ainda lá está**: aparece "Obrigado: o reporte fica mais tempo."
7. [ ] Criar um reporte em cima de uma rua, pedir direções que passem nela e tocar em
   **Simular**: ao aproximar, aparece "Obras a … m" e a voz avisa uma vez.
8. [ ] Durante a navegação, tocar em **Reportar** → **Polícia**: o reporte fica no mapa e
   desaparece ao fim de 60 minutos.
9. [ ] No menu, desligar "Mostrar e avisar reportes de polícia": os reportes de polícia deixam de
   aparecer.
10. [ ] No menu, **Apagar todos os reportes**: o mapa fica sem reportes.
