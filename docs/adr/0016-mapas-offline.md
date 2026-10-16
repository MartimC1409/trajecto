# ADR 0016: Mapas offline e app sem rede (Fase 7)

- **Estado:** Aceite (2026-10-16)
- **Data:** 2026-10-16
- **Atualiza:** [ADR 0003](0003-mapa-base-e-tiles.md) (tiles do OpenFreeMap), plano da Fase 7
  (`docs/fase-0-planeamento.md`: "PWA instalável e a funcionar sem rede para mapas transferidos")

## Contexto

A app não tinha service worker: sem rede, nem abria. A Fase 7 pede mapas transferidos por região
e a PWA a funcionar sem rede nessas zonas. Os tiles vêm do OpenFreeMap; o relevo, do Mapterhorn.

## Termos verificados (2026-10-16)

- **OpenFreeMap** (Termos de Serviço, "Offline Downloads", atualizados a 2026-10-14, lidos no
  repositório público `hyperknot/openfreemap`, ficheiro `website/content/policies/tos.md`): uma app
  pode deixar os utilizadores transferir zonas para uso offline se cada transferência tiver **no
  máximo 3000 tiles ou 50 MB**, usar **no máximo 4 pedidos em paralelo** e enviar um
  **User-Agent próprio** que identifique a app. Para mais, é preciso contactar
  `info@openfreemap.org`. A recolha automática de dados fora disto é proibida.
- **Mapterhorn** (relevo): não publica limites nem autoriza transferências em massa. O relevo
  **não é guardado**; sem rede, o mapa aparece sem sombreado.
- **Armazenamento no browser:** no Safari 17 e no iOS 17, a quota por site é de cerca de 60% do
  disco, também para apps no ecrã principal; `navigator.storage.persist()` evita que o browser
  apague os dados quando falta espaço ([WebKit, "Updates to Storage Policy"](https://webkit.org/?p=14403);
  [MDN](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).
  O limite de 7 dias sem uso do Safari aplica-se a sites abertos no browser; apps no ecrã principal
  ficam isentas segundo fontes secundárias, por isso a app recomenda a instalação no iPhone.

## Decisão

1. **Zona = o que está no ecrã.** No menu, "Mapas offline" → "Guardar esta zona": todos os tiles
   do zoom 0 ao 14 (o máximo do OpenFreeMap; acima disso o mapa amplia) da zona visível, cortada à
   área suportada (Portugal, Espanha, ilhas, Canárias). Até 20 zonas.
2. **Limites dos termos cumpridos antes e durante a transferência.** Antes: a zona tem de ter no
   máximo 3000 tiles e uma estimativa até 50 MB. A estimativa usa tamanhos medidos nos tiles reais
   (zoom 14: média de 171 KB comprimidos no centro de Lisboa e 60 KB em Évora; zoom 12: 64 KB e
   25 KB), com valores de cidade para não ficar abaixo do real. Numa cidade, uma zona chega a
   cerca de 25 km × 25 km. Durante: no máximo 4 pedidos em paralelo; a transferência para ao chegar
   aos 50 MB (uma continuação conta com o que a zona já tinha).
3. **Pedidos pela função própria `/api/offline-tile`.** Os browsers não deixam a página mudar o
   User-Agent, que os termos exigem. A função:
   - aceita só `v` (versão dos tiles, `\d{8}_\d{6}_pt`, ou `latest`), `z` (0–14), `x` e `y`;
   - recusa tiles fora da área suportada (não serve de proxy genérico);
   - pede ao OpenFreeMap com o User-Agent da app, sem cookies nem Referer;
   - devolve o tile comprimido (gzip) sem `Content-Encoding`, para a app o guardar assim (cerca de
     3 vezes menos espaço), com o tamanho em `X-Tile-Bytes`;
   - impõe 15 s de tempo máximo e 2 MB por tile, passa o 429 com `Retry-After`.
4. **Guardado na Cache Storage** (`trajecto-offline-tiles-v1`), com chaves independentes da
   versão. Ao apagar uma zona, só se apagam os tiles que nenhuma outra zona usa.
5. **O mapa pede tudo por um protocolo próprio do MapLibre (`trajecto://`).** TileJSON (rede, ou a
   última cópia guardada), tiles (das zonas guardadas vêm do dispositivo, mesmo com rede, para
   poupar dados; os outros da rede, como antes) e tipos de letra (guardados quando usados, e os
   três intervalos usados em português guardados com cada zona). Os servidores contactados são os
   mesmos; a CSP não muda.
6. **Service worker** (`sw.js`, JavaScript simples sem módulos): guarda na instalação os ficheiros
   da app (página, código, estilos, ícones, radares; ~2,3 MB); página da rede, ou da cópia
   guardada sem rede ou ao fim de 4 s; código e ícones da cópia guardada; `/api`, `/geocoder` e
   outros sites nunca passam por ele. A build escreve a lista de ficheiros e uma versão calculada
   do conteúdo; cada publicação com alterações instala a versão nova e apaga só as cópias antigas
   da app (nunca os mapas guardados).
7. **Aviso "Sem rede"** no topo do ecrã quando o browser indica que não há rede.

## Alternativas consideradas

- **PMTiles próprios** (Planetiler → ficheiro por região num armazenamento de objetos): sem
  limites de transferência, mas precisa de conta e alojamento (por exemplo, Cloudflare R2) e de
  uma pipeline semanal. Fica para quando os limites do OpenFreeMap não chegarem.
- **Transferir diretamente do OpenFreeMap no browser:** não cumpre o User-Agent exigido.
- **Guardar os tiles através do service worker:** os pedidos do MapLibre saem dos seus workers,
  que nem todos os browsers fazem passar pelo service worker; o protocolo do MapLibre corre na
  página e funciona em todos.

## Privacidade (RGPD)

- Os mapas guardados ficam só no dispositivo.
- Para os transferir, os pedidos passam pelo servidor do Trajecto no Vercel: o OpenFreeMap recebe
  o IP do Vercel e o User-Agent da app, e os pedidos indicam a zona escolhida. Está explicado no
  menu "Sobre".

## Limitações

- Sem relevo nas zonas guardadas; sem pesquisa, rotas, meteorologia nem transportes sem rede.
- Zonas grandes têm de ser guardadas em várias partes (50 MB cada).
- Os tiles guardados não se atualizam sozinhos; para mapas mais recentes, apagar e guardar de
  novo.
- Browsers sem Cache Storage ou sem `DecompressionStream` (Safari anterior ao 16.4) não podem
  guardar mapas; a app explica-o.

## Verificação

- Testes unitários: cálculo dos tiles e da estimativa, limites, sobreposição de zonas, registo,
  função `/api/offline-tile`, armazenamento, transferência (paralelismo, limite de bytes, 429,
  falhas, cancelamento, espaço cheio), protocolo do mapa, service worker (instalação, ativação,
  página sem rede, rede lenta, o que não interceta), plugin da build e a secção do menu.
- Teste ponta a ponta (Chromium; WebKit no CI): guardar a zona visível, desligar a rede (sem
  respostas simuladas), recarregar: a app abre, o aviso "Sem rede" aparece e o mapa carrega sem
  nenhuma falha. Controlo: sem zona guardada, a mesma situação dá 14 falhas de tiles.
- Serviço real (workflow "Serviços reais", 2026-10-16): tiles de Lisboa e de Évora pela função,
  com os tamanhos indicados acima.
