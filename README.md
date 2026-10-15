# Trajecto

Aplicação pessoal de mapas e navegação para Portugal, em português europeu.
É uma aplicação web instalável no telemóvel (PWA).

> **Estado: Fase 6 concluída, a aguardar validação no telemóvel.** Já há mapa, pesquisa,
> favoritos, rotas, navegação com voz, meteorologia na rota, reportes, radares fixos e
> transportes públicos ([plano](docs/fase-0-planeamento.md), [Fases 2 e 3](docs/fase-2-3/verificacao.md),
> [Fase 4](docs/fase-4/verificacao.md), [Fase 5](docs/fase-5/verificacao.md),
> [Fase 6](docs/fase-6/verificacao.md)).

## Transportes públicos (Fase 6)

- **Ligações** de metro, autocarro, comboio, elétrico e barco pelo [Transitous](https://transitous.org)
  (horários abertos), com horas, transbordos, linhas com as cores do operador e atrasos em tempo
  real quando o operador os publica.
- **No mapa:** o percurso com a cor de cada linha e os troços a pé ponteados
  ([ADR 0015](docs/adr/0015-transportes-publicos-transitous.md)).

## Mapa detalhado

- **Locais com ícones** por categoria (restaurantes, farmácias, estações, combustível…); ao tocar,
  mostra o nome, a categoria e a morada.
- **Relevo do terreno**, setas de sentido único, pontes, ciclovias, metro e elétrico, escudos das
  estradas, saídas, rios, parques e serras com altitude ([ADR 0014](docs/adr/0014-mapa-detalhado-e-relevo.md)).

## Reportes e radares (Fase 5)

- **Reportar:** polícia, acidente, perigo, trânsito parado, obras e estrada cortada, durante a
  navegação ou num ponto do mapa. Ficam só neste dispositivo e desaparecem sozinhos.
- **Avisos na navegação:** reportes e radares fixos em cima da rota, no ecrã e por voz.
- **Radares fixos:** do OpenStreetMap (ODbL), atualizados uma vez por mês
  ([ADR 0013](docs/adr/0013-reportes-locais-e-radares.md)).

## Meteorologia na rota (Fase 4)

- **Previsão à hora de passagem** em pontos ao longo da rota (Open-Meteo, CC BY 4.0).
- **Avisos:** chuva forte, trovoada, neve, gelo, nevoeiro, vento forte e calor, com hora e km.
- **Sem trânsito:** os tempos são estimados sem trânsito ([ADR 0012](docs/adr/0012-meteorologia-na-rota.md)).

## Rotas e navegação (Fases 2 e 3)

- **Direções:** carro, mota, a pé e bicicleta; partida na tua localização ou noutro local; até 8 paragens.
- **Opções:** evitar portagens, autoestradas ou ferries; caminho mais curto; partir ou chegar a uma hora.
- **Resultados:** até 3 rotas com duração, distância, hora de chegada, portagens e custo estimado de combustível.
- **Navegação:** instruções por voz em português, faixas recomendadas, recálculo automático, ecrã sempre ligado.
- **Simulação:** percorre a rota sem sair de casa (1× ou 4×).
- **Serviço de rotas:** Valhalla público da FOSSGIS, sem garantias de disponibilidade ([ADR 0011](docs/adr/0011-rotas-e-navegacao.md)).

## O que já funciona (Fase 1)

- **Mapa vetorial:** zoom, rotação e inclinação (edifícios em 3D), modo claro e escuro.
- **Pesquisa:** autocompletar em Portugal, navegação com teclado e mensagens de erro claras.
- **Morada de um ponto:** clica no mapa ou usa "Que sítio é este?" (funciona só com teclado).
- **Favoritos e histórico:** Casa, Trabalho e favoritos, mais um histórico de pesquisas.
  - Ficam só no teu dispositivo e podes apagar cada entrada ou tudo de uma vez.
  - Podes desligar o histórico.
- **Língua:** português europeu, com inglês disponível.
- **Acessibilidade:** verificada automaticamente segundo a WCAG 2.2 AA (axe-core), com áreas de toque de 44 px.

## Começar

- **Windows, passo a passo:** [docs/fase-1/guia-instalacao-windows.md](docs/fase-1/guia-instalacao-windows.md).
- **Resumo:** precisas de [Node.js 24.21.0 LTS](https://nodejs.org/) e de pnpm 12.11.2.

```sh
npm install -g pnpm@12.11.2
pnpm install
pnpm dev          # abre http://localhost:5173
```

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Arranca a app em modo de desenvolvimento em http://localhost:5173 |
| `pnpm dev:lan` | O mesmo, acessível a partir do telemóvel na mesma rede Wi-Fi |
| `pnpm build` | Cria a versão de produção em `apps/web/dist` |
| `pnpm preview` | Serve a versão de produção em http://localhost:4173, com cabeçalhos de segurança |
| `pnpm check` | Lint, formatação, tipos, testes unitários com cobertura e build (o mesmo que o CI) |
| `pnpm test` | Só os testes unitários |
| `pnpm test:e2e` | Testes ponta a ponta com Playwright (ver o guia para instalar os browsers) |
| `pnpm format` | Formata o código com Prettier |

## Estrutura

```text
trajecto/
├─ apps/web/            # Aplicação web (Vite + React + MapLibre GL JS)
│  ├─ src/              # Componentes, mapa, i18n, testes unitários
│  ├─ e2e/              # Testes ponta a ponta (Playwright + axe-core)
│  └─ public/           # Manifesto da PWA e ícones
├─ packages/core/       # Lógica de domínio sem browser (pesquisa, favoritos, preferências)
└─ docs/                # Plano, decisões de arquitetura (ADR) e guias
```

## Configuração

Os valores por omissão funcionam sem configuração. Para os mudar, copia
`apps/web/.env.example` para `apps/web/.env.local` e edita-o. Nunca coloques segredos nesse
ficheiro: as variáveis `VITE_*` ficam visíveis no browser.

## Serviços externos, limites e privacidade

| Serviço | Para quê | Limites e termos |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org) | Tiles do mapa | Gratuito e sem chave; atribuição obrigatória; **sem garantia de disponibilidade (SLA)** |
| [Photon (komoot)](https://photon.komoot.io) | Pesquisa e moradas | Servidor público para uso "num limite razoável". Uso intensivo é limitado ou bloqueado e não há garantias. Por isso a app espera 300 ms depois de escreveres (*debounce*), exige 3 letras, guarda resultados em cache e cancela pedidos antigos |
| [Valhalla (FOSSGIS)](https://valhalla1.openstreetmap.de) | Rotas | Servidor público, uso justo (1 pedido por segundo), sem garantias; passa pela função `/api/route` |
| [Open-Meteo](https://open-meteo.com) | Meteorologia na rota | Gratuito só para uso não comercial, < 10 000 pedidos/dia; CC BY 4.0; passa pela função `/api/weather` |
| [Overpass API](https://overpass-api.de) | Radares fixos (OSM) | Só uma consulta por mês, no GitHub Actions; a app nunca o consulta |
| [Mapterhorn](https://mapterhorn.com) | Relevo do terreno (opcional) | Gratuito; recebe o IP e as zonas vistas (guarda até 30 dias); dados DGT (CC BY 4.0) e Copernicus; desliga-se no menu |
| [Transitous](https://transitous.org) | Transportes públicos | Comunitário, sem garantias; só para projetos de código aberto não comerciais; 20 pedidos de rotas por minuto por IP; guarda IP, URL e User-Agent 2 dias; passa pela função `/api/transit` |

Estes serviços recebem o teu endereço IP, o que pesquisas e as zonas do mapa que vês.
Os teus favoritos, histórico e definições **nunca saem do dispositivo**.

## Atribuições e licenças de dados

- Dados do mapa © [contribuidores do OpenStreetMap](https://www.openstreetmap.org/copyright), licença ODbL.
- Esquema de tiles © [OpenMapTiles](https://www.openmaptiles.org/), CC-BY 4.0.
- Radares fixos (`apps/web/public/data/speed-cameras.json`): © contribuidores do OpenStreetMap,
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Meteorologia: [Open-Meteo.com](https://open-meteo.com), CC BY 4.0.
- Relevo: [Mapterhorn](https://mapterhorn.com/attribution), com dados da Direção-Geral do Território
  (CC BY 4.0) e Copernicus WorldDEM-30 (© DLR e.V. 2010-2014 e © Airbus Defence and Space GmbH
  2014-2018, fornecido no âmbito do COPERNICUS pela União Europeia e pela ESA).
- Transportes públicos: [Transitous](https://transitous.org/sources/) (cada fonte de horários com a
  sua licença, por exemplo Carris Metropolitana CC BY 4.0) e © contribuidores do OpenStreetMap.
- Fontes Noto Sans: SIL Open Font License 1.1.

## Licença

- **Código:** [MIT](LICENSE). Podes usar, copiar e alterar o código, mantendo o aviso de copyright.
- **Dados de terceiros** (não são MIT): os radares em `apps/web/public/data/` continuam sob a ODbL
  do OpenStreetMap; a meteorologia, os mapas e as fontes seguem as licenças indicadas acima.

## Documentação

- [Fase 0: planeamento, stack e requisitos](docs/fase-0-planeamento.md)
- [Decisões de arquitetura (ADR)](docs/adr/README.md)
- [Guia de instalação no Windows](docs/fase-1/guia-instalacao-windows.md)
- [Publicar no Vercel para testar no iPhone](docs/fase-1/deploy-vercel.md)
- Verificações: [Fases 2 e 3](docs/fase-2-3/verificacao.md), [Fase 4](docs/fase-4/verificacao.md),
  [Fase 5](docs/fase-5/verificacao.md), [Fase 6](docs/fase-6/verificacao.md)
