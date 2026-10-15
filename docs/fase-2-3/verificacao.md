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
| Testes unitários `@trajecto/core` | `pnpm test:coverage` | ✅ 122 testes; linhas 99,4 %, instruções 99,1 % (meta ≥80 %) |
| Testes unitários `@trajecto/web` | `pnpm test:coverage` | ✅ 169 testes; linhas 97,9 %, instruções 96,2 % (meta ≥70 %) |
| Build de produção | `pnpm build` | ✅ |
| Testes ponta a ponta: Chromium desktop e Android | `pnpm test:e2e` | ✅ 29 passaram, 1 ignorado de propósito (toque no desktop) |
| Acessibilidade WCAG 2.2 AA (axe-core) | incluído no `pnpm test:e2e` | ✅ 0 violações no painel de direções e no ecrã de navegação |
| CSP | incluído no `pnpm test:e2e` | ✅ 0 violações, incluindo o campo de data e hora (Chromium) |
| Testes ponta a ponta no CI: desktop, Android e iPhone (WebKit) | GitHub Actions | ✅ commit `14453eb` ([execução 38604783252](https://github.com/MartimC1409/trajecto/actions/runs/38604783252)) |

Os testes ponta a ponta das rotas usam uma resposta do Valhalla gravada no formato oficial
(`apps/web/e2e/fixtures/valhalla.ts`) e posições GPS simuladas pelo Playwright.

### Não verificado aqui

- **Servidor real do Valhalla:** a rede deste ambiente bloqueia `valhalla1.openstreetmap.de`.
  O formato foi confirmado na documentação e no código-fonte do Valhalla 3.9.1. A verificação
  com o servidor real é o item 1 da lista abaixo.
- **Voz e ecrã ligado num telemóvel real:** dependem do sistema; só podem ser testados no iPhone.
- **Campo de data e hora no WebKit:** o teste é ignorado no WebKit até ser validado no CI.

## Revisão crítica (agentes independentes)

Três revisores analisaram o motor de navegação, a função `/api/route` e a interface; cada
problema foi confirmado por outro agente (alguns reproduzidos com o código real) antes de ser
corrigido. Corrigido:

| Problema | Correção |
|---|---|
| Em rotas de ida e volta pela mesma estrada, a posição saltava para a volta: avisos errados e recálculos desnecessários | Associação pela ordem da rota, com avanço plausível e direção do GPS; testes de ida e volta |
| Chegada dada por passar perto do destino na outra faixa, antes de dar a volta | A distância em linha reta só conta perto do fim da rota |
| Sem velocidade do GPS, um salto na rota parecia uma velocidade enorme e a instrução era dita cedo demais | Velocidade só entre posições seguidas na rota, com limite por modo |
| O intervalo de 15 s entre recálculos recomeçava a cada rota nova | Intervalo contado na sessão de navegação |
| Depois de recalcular, o ecrã mostrava a manobra da rota antiga | Estado recalculado logo com a última posição |
| "Iniciar" usava a rota anterior enquanto a nova ainda estava a ser calculada | Só ativo com o resultado do pedido atual |
| No iPhone, ligar a voz a meio da viagem ficava em silêncio | A voz é ativada no próprio toque |
| O botão de localização do mapa mexia na câmara durante a navegação | Botão retirado durante a navegação e reposto no fim |
| Ao terminar, o mapa ficava no último ponto em vez de mostrar as rotas | Um só movimento de câmara |
| Tocar na rota durante a navegação mudava a rota escolhida | Ignorado durante a navegação |
| Foco perdido ao fechar a pesquisa de um ponto; avisos de estado nem sempre anunciados | Foco no título; região de estado sempre presente |
| A função aceitava as chaves herdadas `constructor` e `toString` nas opções | Só chaves próprias da lista |
| Uma ligação cortada a meio da resposta fazia a função falhar sem resposta | Resposta 502/504 em JSON |
| Canárias fora da área suportada | Área com uma segunda caixa (Canárias e Selvagens) |

Recusados depois de verificados (não eram defeitos reais): aviso de chegada a uma paragem
dito ~70 m antes (é o comportamento definido pelo Valhalla para avisos imediatos); paragem
"não alcançada" quando se estaciona a mais de ~45 m da rota; ausência de limite de pedidos na
função (já documentado como uso pessoal; o cabeçalho `Sec-Fetch-Site` só protege browsers).

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
