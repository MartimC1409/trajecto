# ADR 0014: Mapa mais detalhado e relevo do terreno

- **Estado:** Aceite (2026-10-15)
- **Data:** 2026-10-15
- **Atualiza:** [ADR 0003](0003-mapa-base-e-tiles.md) (estilo próprio sobre os tiles do OpenFreeMap)

## Contexto

O estilo do mapa da Fase 1 era mínimo: nomes de locais só em texto a partir do zoom 15, sem
ícones, sem pontes, ciclovias, metro, escudos das estradas ou relevo. Tinha também defeitos:
nomes de lagos na margem, pistas de aeroporto e praças pedonais desenhadas como contornos.

## Decisão

1. **Só campos e valores que os tiles têm.** O OpenFreeMap gera os tiles com o Planetiler
   (perfil OpenMapTiles, esquema 3.16.0 do `planetiler-openmaptiles` fixado pelo OpenFreeMap). As
   camadas usam apenas classes e campos desse esquema gerado (por exemplo, não existe
   `landuse=parking` nem `class=rail` na camada `poi`).
2. **Ícones desenhados pela própria app.** 35 desenhos próprios (traço, no estilo dos ícones da
   app) são convertidos em imagens no browser com Canvas 2D (`map.setMissingStyleImageResolver`)
   só quando o mapa os pede. Não há ficheiro de sprite, nem servidores novos, nem licenças de
   terceiros, e a CSP não muda. Os estilos Liberty/Bright do OpenFreeMap não foram copiados
   (ADR 0003).
3. **Novas camadas:** ícones de locais por categoria (cores por tipo: comida, saúde,
   transportes…), estações a partir do zoom 12, setas de sentido único, pontes por cima das
   estradas, ciclovias, metro/elétrico (à superfície e em túnel), obras, teleféricos, escudos
   das estradas (autoestradas a azul), saídas, rios, parques, picos com altitude, aeroportos,
   ilhas, bairros, campos/vinhas, zonas húmidas, rocha, cemitérios, hospitais, desporto,
   praças pedonais. Edifícios planos até ao zoom 15 e em 3D a partir daí (menos trabalho para o
   telemóvel).
4. **Tocar num local** mostra logo o nome e a categoria (por exemplo "Farmácia") e a morada
   chega depois pela pesquisa inversa que a app já usa (Photon). Não se pedem horários nem
   telefones a outros serviços.
5. **Relevo do terreno (Mapterhorn), ligado por omissão e com interruptor no menu.** Tiles
   Terrarium em WebP, `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, até ao zoom 12 (o planeta
   inteiro existe até ao 12; acima o MapLibre amplia). Só o sombreado 2D; o 3D fica para depois.

## Limitações, licenças e privacidade

- **Mapterhorn:** dados de altitude abertos; para Portugal continental usa os Modelos Digitais do
  Terreno da Direção-Geral do Território (CC BY 4.0) e, no resto, o Copernicus GLO-30. A
  atribuição aparece no mapa ("© Mapterhorn", com ligação) e no menu "Sobre", com a frase exigida
  pela licença Copernicus. Não foi encontrado um limite de uso publicado.
- **Privacidade do relevo:** o Mapterhorn (servido pela Cloudflare) recebe o IP, a origem do
  site e as coordenadas dos tiles (a zona vista); a política de privacidade diz que os guarda até
  30 dias. Com o interruptor desligado, não se fazem esses pedidos (a fonte nem é criada).
- **CSP:** `connect-src` passa a incluir `https://tiles.mapterhorn.com` (o MapLibre descarrega
  os tiles de altitude com `fetch`).
- **Verificado com os serviços reais** (workflow "Mapa à vista", 2026-10-15): tiles do
  OpenFreeMap e do Mapterhorn com resposta 200 e CORS `*`, sem violações da CSP, em Chromium e no
  WebKit (motor do Safari), incluindo o relevo em WebP.
- Os nomes e categorias dos locais dependem do OpenStreetMap: podem faltar locais ou estar
  desatualizados.

## Consequências

Positivas:

- Mapa muito mais legível e útil, sem custos nem servidores novos (exceto o relevo, opcional).
- As imagens dos ícones são testadas (formas, cores, tamanhos) sem browser.

Negativas:

- Mais camadas para desenhar (mais trabalho para a placa gráfica em telemóveis antigos).
- Mais um serviço externo (Mapterhorn) quando o relevo está ligado.
