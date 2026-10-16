# Fase 7: orçamento de dados e bateria

Data: 2026-10-16. Critério do plano: "Orçamento de bateria e dados medido".

## Como se mediu

- Script [`apps/web/scripts/budget.mjs`](../../apps/web/scripts/budget.mjs), no workflow
  "Mapa à vista" do GitHub Actions, com os **serviços reais** (OpenFreeMap, Mapterhorn, Valhalla,
  Photon) e a versão de produção (`pnpm preview`). O relatório de cada execução fica em
  `budget.md` e `budget.json` no ramo `claude/capturas-mapa`.
- Browser: Chromium sem janela, ecrã de telemóvel (412 × 915, densidade 2), português.
- **Dados:** bytes recebidos por tipo (app, funções, tiles, tipos de letra, relevo), tal como
  chegam pela rede (comprimidos, com cabeçalhos), pelo protocolo de depuração do Chrome (CDP).
- **Processador:** tempo de trabalho da página (CDP `Performance.getMetrics`, `TaskDuration`) a
  dividir pelo tempo decorrido.
- **Navegação:** simulação de Marquês de Pombal → Oriente (Lisboa), 2 minutos a 4× (8 minutos de
  condução), com e sem relevo, e com a zona da rota guardada antes.

### Limites desta medição

- No CI não há placa gráfica: o mapa é desenhado por software (SwiftShader). O valor do
  processador serve para **comparar variantes**, não para prever a bateria de um telemóvel.
- Não há GPS, rádio móvel nem ecrã reais. A bateria tem de ser medida num telemóvel (protocolo
  abaixo).
- As primeiras execuções deram valores diferentes para a mesma navegação (1,67 MB e 0,29 MB com
  relevo), sem indicar a distância percorrida. O relatório passou a ler no ecrã de navegação os km
  percorridos e a dar os dados por km; os valores abaixo são dessa execução (2,6 km em cada
  variante).
- Só se mediu condução em cidade (Lisboa, cerca de 20 km/h na simulação). Em estrada, o mapa
  muda mais depressa; não foi medido.

## Orçamento e resultados

Execução de 2026-10-16 às 21:00 UTC (commit `0ed9c01`), confirmada nas execuções anteriores
(`860947c` e `05b8632`) para a app, a abertura do mapa, o processador e a zona guardada.

| Medida | Orçamento (meta) | Medido | Estado |
|---|---|---|---|
| App guardada pelo service worker (11 ficheiros) | ≤ 1 MB comprimida | 0,65 MB (2,29 MB sem compressão) | ✅ |
| Abrir o mapa em Lisboa, 1.ª visita | ≤ 2 MB | 1,63 MB (app 0,47; tiles 0,60; relevo 0,43; letras 0,14) | ✅ |
| Abrir de novo | ≤ 0,1 MB | 0,00 MB (cache do browser e service worker) | ✅ |
| Navegação em cidade, com rede, com relevo | ≤ 1 MB por km | 0,72 MB por km (1,88 MB em 2,6 km; ≈ 14 MB por hora) | ✅ |
| Navegação em cidade, com rede, sem relevo | ≤ 1 MB por km | 0,56 MB por km (1,46 MB em 2,6 km; ≈ 11 MB por hora) | ✅ |
| Navegação numa zona guardada | 0 MB de mapa | 0,00 MB em 2,6 km | ✅ |
| Zona guardada (termos do OpenFreeMap) | ≤ 50 MB e ≤ 3000 tiles | limites aplicados antes e durante a transferência | ✅ |
| Estimativa de uma zona | não ficar abaixo do real em Portugal | Baixa: 2,6 MB estimados, 2,62 MB reais; rota Marquês → Oriente: 9,5 MB estimados, 7,26 MB reais | ✅ |
| Processador da página durante a navegação (indicador) | ≤ 15 % | 8 % a 10 % | ✅ |
| Bateria num telemóvel | não gastar mais do que outra app de navegação no mesmo percurso | por medir (protocolo abaixo) | ⏳ |

## O que se otimizou, com o ganho medido

- **Zonas guardadas usadas também com rede:** a navegação na zona da rota gastou 0,00 MB de mapa,
  contra 1,88 MB sem a zona (−100 % nos tiles).
- **Estimativa das zonas com tamanhos reais por zoom:** a zona da Baixa era estimada em 1,2 MB
  para 2,62 MB reais (metade). Agora é estimada em 2,6 MB.
- **Sem rede, a navegação deixa de tentar recalcular a cada 15 s.** Antes, cada tentativa falhada
  usava a rede, o processador e a voz.
- **Reabrir a app:** 0 MB (o service worker e a cache do browser servem tudo).

## Decidido não mudar

- **Relevo durante a navegação:** custa cerca de 0,2 MB a cada 2,6 km (+29 % de dados), sem
  diferença no processador medido (8 % com relevo, 10 % sem). Fica ligado, porque foi pedido um
  mapa mais detalhado. Quem quiser poupar dados pode desligá-lo no menu ("Relevo do terreno").

## Bateria: como medir no telemóvel

O CI não tem bateria, GPS nem ecrã reais. Para medir:

1. Carrega o telemóvel a 100 %. Fixa o brilho (por exemplo, a 50 %), desliga a poupança de
   energia e fecha as outras apps.
2. Abre o Trajecto instalado no ecrã principal e escolhe um percurso de pelo menos 30 minutos.
3. Toca em **Iniciar** e navega durante 30 minutos (com GPS real). Em alternativa, usa
   **Simular** a 1×, que mede o ecrã, o mapa e a voz, mas não o GPS.
4. Anota a percentagem de bateria no início e no fim.
5. Repete o mesmo percurso, nas mesmas condições, com outra app de navegação.
6. Para os dados móveis: nas definições do telemóvel, consulta o uso de dados por app (no
   Android, o Trajecto instalado pode aparecer como Chrome).

O orçamento é cumprido se o Trajecto não gastar mais bateria do que a outra app. Os valores
medidos devem ser acrescentados a este documento.

## Reproduzir

- No GitHub: Actions → "Mapa à vista" → Run workflow. O relatório fica em `budget.md` no ramo
  `claude/capturas-mapa`.
- Localmente, com acesso aos serviços: `pnpm --filter @trajecto/web build`, depois
  `pnpm --filter @trajecto/web preview` e `node apps/web/scripts/budget.mjs
  http://127.0.0.1:4173 saida apps/web/dist`.
