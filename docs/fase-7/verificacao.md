# Fase 7: mapas sem rede, orçamento, segurança e publicação, verificação

Data: 2026-10-16.

Os resultados abaixo foram obtidos num ambiente Linux com Node.js 24.21.0 e pnpm 12.11.2, e no
GitHub Actions (WebKit e serviços reais). Decisões: [ADR 0016](../adr/0016-mapas-offline.md)
(mapas offline) e [ADR 0017](../adr/0017-rotas-sem-rede.md) (rotas sem rede).

Critérios de aceitação do plano: "Orçamento de bateria e dados medido; OWASP revisto; PWA
instalável e a funcionar sem rede para mapas transferidos".

## O que foi feito

- **Mapas offline por zona:** menu → "Mapas offline" → "Guardar esta zona" (zoom 0 a 14 da zona
  visível), com estimativa, progresso, cancelar, continuar, ver no mapa e apagar. Limites dos
  termos do OpenFreeMap cumpridos: 3000 tiles ou 50 MB por transferência, 4 pedidos em paralelo,
  User-Agent próprio (função `/api/offline-tile`).
- **App sem rede:** service worker com os ficheiros da app; o mapa usa as zonas guardadas (também
  com rede, para poupar dados); aviso "Sem rede".
- **Estimativa do tamanho corrigida** com os tamanhos reais por zoom (a zona pequena da Baixa:
  1,2 MB estimados antes, 2,6 MB agora, 2,62 MB reais).
- **Navegação sem rede:** continua com a rota calculada; fora da rota, avisa uma vez e recalcula
  quando a rede voltar (antes tentava a cada 15 s e dizia "A recalcular a rota…" sem sucesso).
- **Rotas no dispositivo:** investigadas e não adotadas ([ADR 0017](../adr/0017-rotas-sem-rede.md)).
- **Orçamento de dados e processador** medido com os serviços reais
  ([orçamento](orcamento.md)).
- **Revisão de segurança OWASP** (ASVS nível 1) com cabeçalhos novos e proteção das funções
  ([relatório](seguranca.md)).
- **PWA instalável** verificada no Chromium; guia de instalação ([instalar](instalar.md)).
- **Avisos do mapa** com a fonte e o tile que falhou (no Safari a mensagem não o dizia).

## Resultados automáticos

| Verificação | Resultado |
|---|---|
| Lint (ESLint, sem avisos) e formatação (Prettier) | Sem erros |
| TypeScript (`tsc --noEmit`, core e web) | Sem erros |
| Testes unitários (core) | 189 passaram; cobertura 99,1 % das instruções |
| Testes unitários (web) | 393 passaram, 11 ignorados (só correm contra os serviços reais); cobertura 95,9 % |
| Build de produção | Sem erros |
| Testes ponta a ponta (Chromium no computador e no Android) | 39 passaram, 1 ignorado (só para ecrã tátil) |
| Testes ponta a ponta no CI (computador, Android e iPhone/WebKit) | 57 passaram, 3 ignorados; no WebKit, sem rede, o mapa da zona guardada carrega sem falhas |
| Sem rede, sem respostas simuladas (Chromium) | App abre, aviso "Sem rede", mapa sem nenhuma falha; controlo sem zona guardada: 14 falhas |
| PWA instalável (Chromium, `Page.getInstallabilityErrors`) | Sem erros; controlo com manifesto incompleto: 4 erros |
| Acessibilidade (axe, WCAG 2.2 AA) com a secção "Mapas offline" | Sem violações |
| CSP em produção (`pnpm preview`), com e sem rede | Sem violações |
| `pnpm audit` | Sem vulnerabilidades conhecidas (2026-10-16) |
| Serviços reais (GitHub Actions) | Tiles pela função `/api/offline-tile` em Lisboa, Évora e Madrid (zoom 0 a 14); rotas, transportes e meteorologia em produção |
| Orçamento de dados e processador | Todas as metas cumpridas ([orçamento](orcamento.md)); a bateria fica por medir no telemóvel |

## Risco encontrado no WebKit (Safari)

No WebKit do Playwright (CI), a Cache Storage escrita pela **primeira página**, aberta antes de o
service worker a controlar, ficou vazia depois de recarregar (um tile de marca escrito por essa
página não existia depois: `{"found":false,"keys":0}`). O que o service worker e as páginas
seguintes escrevem mantém-se. Na app, isto corresponde a guardar uma zona logo na primeira visita.
Não foi possível confirmar no Safari real a partir deste ambiente; está na lista de verificação no
iPhone (abaixo). Se acontecer, a zona fica listada mas o mapa dela pede tiles à rede; basta apagar
a zona e guardá-la de novo. O teste automático no WebKit guarda a zona depois de um recarregamento.

## Publicação

Ainda não publicada. A publicação faz-se pela integração do Vercel com o GitHub, ao integrar o PR
no `main` (a ligação do Vercel desta sessão não tem permissão para publicar). Depois de
publicada:

- mudar `TRAJECTO_PRODUCTION_OFFLINE` para `'1'` em `.github/workflows/live-services.yml`, para o
  workflow "Serviços reais" testar `/api/offline-tile` no site publicado;
- fazer a verificação no telemóvel (abaixo).

## Como testar no telemóvel

Guia completo: [instalar e usar sem rede](instalar.md).

1. **Instalar:** no iPhone, Safari → Partilhar → "Adicionar ao ecrã principal"; no Android,
   Chrome → ⋮ → "Instalar app".
   - [ ] a app abre pelo ícone, em ecrã inteiro (sem a barra do browser).
2. **Guardar uma zona:** abre a app, põe a tua zona no ecrã, menu → "Mapas offline" →
   "Guardar esta zona".
   - [ ] a estimativa aparece antes de guardar;
   - [ ] a barra de progresso avança e aparece «… está guardada»;
   - [ ] a zona aparece na lista com o tamanho.
3. **Sem rede:** liga o modo de avião e abre a app pelo ícone.
   - [ ] a app abre e aparece o aviso «Sem rede: o mapa mostra só as zonas guardadas»;
   - [ ] o mapa da zona guardada aparece com ruas e nomes.
4. **Primeira visita no iPhone (risco acima):** apaga a app e os dados do site, abre o site no
   Safari pela primeira vez e guarda logo uma zona, **sem recarregar**. Fecha o Safari, liga o modo
   de avião e volta a abrir.
   - [ ] o mapa da zona aparece (se ficar em branco, diz-me: é o caso descrito acima).
5. **Navegação sem rede:** calcula uma rota dentro da zona guardada e toca em "Iniciar"; depois
   liga o modo de avião.
   - [ ] a navegação continua com a rota e a voz;
   - [ ] se saíres da rota, aparece «Sem rede: não dá para recalcular a rota…» uma só vez, e a
     rota é recalculada quando desligas o modo de avião.
6. **Bateria:** segue o protocolo do [orçamento](orcamento.md#bateria-como-medir-no-telemóvel).

## Limitações conhecidas

- Sem relevo nas zonas guardadas (o Mapterhorn não autoriza transferências em massa).
- Sem pesquisa, rotas novas, transportes nem meteorologia sem rede.
- Zonas grandes guardam-se em várias partes (50 MB cada); no centro de Madrid a estimativa fica
  abaixo do real e a transferência pode parar nos 50 MB.
- Os mapas guardados não se atualizam sozinhos.
- A bateria não foi medida num telemóvel real (só o processador, no CI).

## Custos e licenças

- Tudo gratuito: Vercel (plano gratuito), OpenFreeMap, Mapterhorn, Valhalla da FOSSGIS, Photon,
  Open-Meteo (uso não comercial) e Transitous (projetos de código aberto não comerciais).
- Mapas guardados: dados © contribuidores do OpenStreetMap (ODbL), esquema OpenMapTiles
  (CC-BY 4.0); a atribuição continua visível no mapa sem rede.
- Código: MIT.
