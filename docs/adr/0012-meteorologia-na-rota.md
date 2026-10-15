# ADR 0012: Fase 4 — meteorologia na rota, sem trânsito próprio

- **Estado:** Aceite (2026-10-15)
- **Data:** 2026-10-15
- **Atualiza:** plano da Fase 4 (secção 9 de [`../fase-0-planeamento.md`](../fase-0-planeamento.md))

## Contexto

O plano da Fase 4 previa:

1. recolha anónima de pontos de velocidade, *map matching* e agregação por segmento;
2. um ficheiro `traffic.tar` lido pelo Valhalla, para tempos de chegada com trânsito;
3. meteorologia na rota.

Desde as Fases 2 e 3, as rotas vêm do servidor **público** do Valhalla (ADR 0011). Esse servidor
não aceita dados de trânsito de terceiros: o `traffic.tar` só funciona num Valhalla próprio.
Com um só utilizador, os dados de velocidade também não chegariam para estimar trânsito
(secção 1 do plano). Não há uma fonte aberta e gratuita confirmada de trânsito em tempo real
para Portugal.

## Decisão

1. **Meteorologia na rota (feito):**
   - pontos ao longo da rota escolhida (um a cada 15 km, no máximo 10, sempre com a partida e o
     destino), com a hora estimada de passagem calculada a partir das durações das manobras;
   - previsão horária do **Open-Meteo** para esses pontos, num só pedido, através de uma função
     própria (`apps/web/api/weather.ts`): o Open-Meteo recebe o IP do Vercel e coordenadas
     arredondadas a 3 casas decimais (~100 m), nunca o IP do utilizador;
   - avisos com limiares próprios (chuva forte ≥ 4 mm/h, nevoeiro ou visibilidade < 1 km,
     rajadas ≥ 60 km/h, neve, trovoada, gelo com ≤ 1 °C e precipitação, calor ≥ 35 °C),
     identificados na interface como **não oficiais**;
   - previsão ponto a ponto (hora, estado do céu, temperatura, precipitação, rajadas);
   - funciona com "partir agora", "partir às" e "chegar às", até 7 dias.
2. **Trânsito com dados próprios (adiado):** só faz sentido com um Valhalla próprio e com
   vários utilizadores. Fica para depois da Fase 7, se o projeto crescer. Os tempos continuam a
   ser estimados pela velocidade típica de cada estrada, e a interface diz "hora estimada sem
   trânsito".
3. **Avisos oficiais do IPMA (adiado):** os termos permitem uso pessoal não lucrativo, mas
   exigem a referência à fonte e o logótipo do IPMA com ligação ao site, e pedem um email
   informativo para `webmaster@ipma.pt`. Os avisos são por distrito, sem geometria. Fica como
   melhoria futura, se quiseres enviar esse email.

## Limitações e termos

- **Open-Meteo:** ver "Termos verificados" abaixo. A atribuição "Open-Meteo.com (CC BY 4.0)"
  aparece junto da previsão e no menu "Sobre".
- A hora de passagem é uma estimativa sem trânsito: num engarrafamento, a previsão usada pode
  ser a de uma hora antes da real.
- Pontos a 15 km podem não apanhar fenómenos muito locais (trovoadas, nevoeiro em vales).

## Consequências

Positivas:

- Valor real para um utilizador sozinho, a custo zero e sem servidor próprio.
- A lógica (`route-timing.ts` e `weather.ts` no `core`) é testada sem browser.

Negativas:

- Mais um serviço externo sem garantia de disponibilidade; se falhar, a rota continua a ser
  mostrada, só sem meteorologia.
