# ADR 0017: Rotas sem rede (Fase 7, investigação)

- **Estado:** Aceite (2026-10-16)
- **Data:** 2026-10-16
- **Relacionado:** [ADR 0011](0011-rotas-e-navegacao.md) (rotas pelo Valhalla da FOSSGIS),
  [ADR 0016](0016-mapas-offline.md) (mapas offline)

## Contexto

O plano da Fase 7 pede que se investigue o cálculo de rotas sem rede. Hoje as rotas são calculadas
no servidor público Valhalla da FOSSGIS, através da função `/api/route`. Sem rede, a app abre e
mostra os mapas guardados (ADR 0016), mas não calcula rotas novas.

## O que foi verificado (2026-10-16)

| Opção | O que se verificou | Conclusão |
|---|---|---|
| **Valhalla no browser** (WebAssembly) | No repositório oficial `valhalla/valhalla`, a pesquisa de issues por "wasm", "emscripten" ou "webassembly" não dá nenhum resultado. A pesquisa na web também não encontrou uma versão para browser publicada e mantida. | Não existe uma versão pronta. Compilá-la e manter os dados de rotas de Portugal no telemóvel seria um projeto à parte. |
| **GraphHopper no browser** | O blogue do GraphHopper (2014-05-04, "GraphHopper in the browser: TeaVM makes offline routing via OpenStreetMap possible in JavaScript") descreve uma demonstração com cerca de 14 MB de dados para Londres, que no próprio texto chegou a fazer falhar browsers num telemóvel antigo. | Demonstração antiga, não mantida. Não serve. |
| **Calcular sobre os tiles do mapa já guardados** (camada `transportation` do esquema OpenMapTiles, que o OpenFreeMap usa) | O esquema (`layers/transportation/transportation.yaml` no repositório `openmaptiles/openmaptiles`) tem sentido único (`oneway`), acesso proibido (`access: no`), ramais (`ramp`), portagens (`toll`), pontes e túneis. **Não tem proibições de viragem nem limites de velocidade.** Além disso, as linhas dos tiles vêm cortadas em cada tile e simplificadas para desenhar, não para calcular rotas. | Daria rotas com viragens proibidas e tempos sem limites de velocidade. Não é aceitável para conduzir. |
| **App nativa com dados de rotas descarregados** (por exemplo, Valhalla ou GraphHopper numa app Android/iOS) | Fora do âmbito: a app é uma PWA gratuita, sem lojas de apps. | Fica para uma decisão futura, se a app deixar de ser só web. |

## Decisão

1. **Sem cálculo de rotas no dispositivo nesta fase.** Nenhuma das opções dá rotas corretas e
   sustentáveis numa PWA gratuita.
2. **A navegação continua sem rede com a rota já calculada.** A geometria, as manobras e as frases
   já estão no dispositivo. O GPS funciona sem rede, embora a primeira posição possa demorar mais.
   A voz usa, de preferência, as vozes locais do sistema (`localService`), que não precisam de
   rede. O mapa usa as zonas guardadas.
3. **Fora da rota e sem rede**, a app já não tenta recalcular a cada 15 s. Antes, dizia "A
   recalcular a rota…" e falhava sempre. Agora avisa uma vez, no ecrã e em voz ("Sem rede: não dá
   para recalcular a rota. Volta à rota ou espera pela rede."). Quando a rede volta, recalcula logo
   na posição seguinte.
4. **Recomendação ao utilizador:** antes de uma viagem por zonas sem cobertura, calcular a rota com
   rede e guardar as zonas do mapa por onde vai passar.

## Consequências

- Sem rede não se pesquisam moradas, não se calculam rotas nem transportes, e não há meteorologia.
- Um desvio sem rede só se resolve voltando à rota ou quando a rede volta.

## Verificação

- Teste unitário da sessão de navegação: sem rede e fora da rota, não pede rota nenhuma, avisa uma
  só vez e não diz "A recalcular a rota"; com a rede de volta, recalcula na posição seguinte.
- Teste do ecrã de navegação: mostra o aviso "Sem rede: não dá para recalcular a rota".
