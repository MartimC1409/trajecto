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

- **Open-Meteo (termos verificados a 2026-10-15 no código-fonte oficial do site e do servidor,
  porque open-meteo.com não estava acessível deste ambiente):**
  - uso gratuito só não comercial: uma app pessoal sem anúncios nem subscrições cabe nos
    exemplos de uso não comercial dos termos;
  - menos de 10 000 chamadas por dia, 5 000 por hora e 600 por minuto, contadas por IP; cada
    ponto conta pelo menos 1 chamada (10 pontos por rota = 10 chamadas);
  - sem chave de API (enviar uma chave redireciona para o serviço pago);
  - dados sob CC BY 4.0: junto da previsão aparece "Dados meteorológicos: Open-Meteo.com" com
    ligação, a ligação para a licença e a indicação de que os dados foram amostrados ao longo
    da rota; também no menu "Sobre";
  - endpoint `https://api.open-meteo.com/v1/forecast`, vários pontos separados por vírgulas
    (a resposta passa a ser uma lista), `timeformat=unixtime` (segundos UTC, sem o problema da
    mudança de hora a 25 de outubro), `forecast_days=7`.
- **Risco de limite partilhado:** os limites contam por IP e o IP de saída das funções do Vercel
  é dinâmico e pode ser partilhado com outros clientes (não confirmado). Se aparecerem erros
  429, a alternativa é o browser pedir diretamente ao Open-Meteo (que aceita CORS), à custa de o
  Open-Meteo passar a ver o IP do utilizador.
- O código de tempo 96 nem sempre significa granizo (o servidor usa 96 para trovoada forte):
  95, 96, 97 e 99 são todos tratados como "Trovoada".
- A DWD deixa de fornecer visibilidade no modelo ICON depois de 30 de novembro de 2026; a
  visibilidade é tratada como opcional (o aviso de nevoeiro também usa o código de tempo).
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
