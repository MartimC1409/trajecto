# ADR 0015: Transportes públicos pelo Transitous (Fase 6)

- **Estado:** Aceite (2026-10-15)
- **Data:** 2026-10-15
- **Atualiza:** [ADR 0009](0009-backend-dados-tempo-real.md), ponto 5 (MOTIS próprio): por agora
  usa-se o MOTIS público do Transitous, sem servidor próprio.

## Contexto

A Fase 6 pede ligações de transportes públicos com horários e, quando existir, tempo real. O
ADR 0009 previa um servidor MOTIS próprio. Isso exige um servidor sempre ligado, importar e
atualizar os horários (GTFS/NeTEx) de cada operador e pagar o alojamento. Para um projeto
pessoal sem custos fixos, isso não compensa.

O [Transitous](https://transitous.org) é um serviço comunitário que corre o MOTIS (MIT) com os
horários abertos de toda a Europa, incluindo Portugal, e tem uma API pública. A versão em
produção, confirmada em 2026-10-15, é o **MOTIS v2.11.1**; a app usa o pedido `/api/v6/plan`
dessa versão.

## Decisão

1. **Pedidos pela função própria `/api/transit` (Vercel).** O browser nunca fala diretamente com
   o Transitous. A função:
   - aceita só GET com `fromPlace` e `toPlace` ("lat,lon", dentro de Portugal e de Espanha, a área
     já usada nas rotas) e, opcionais, `time` (ISO 8601 em UTC, entre ontem e daqui a 60 dias) e
     `arriveBy=true`;
   - reconstrói o pedido só com esses campos mais `language=pt`, sem cookies nem Referer;
   - identifica a app com o User-Agent
     `Trajecto/0.1.0 (+https://github.com/MartimC1409/trajecto; https://trajecto-psi.vercel.app)`;
   - impõe 25 s de tempo máximo e 5 MB de resposta, passa o 429 (com `Retry-After`) e responde
     502/504 às falhas;
   - deixa o browser guardar a resposta 60 s (`Cache-Control: private, max-age=60`).
   A CSP não muda: o pedido é para o próprio site (`connect-src 'self'`).
2. **Poucos pedidos.** A app espera 500 ms depois da última alteração e faz no máximo um pedido
   a cada 3 s; os pedidos antigos são cancelados. Só pede quando o separador "Transportes
   públicos" está escolhido.
3. **Leitura validada da resposta** (zod, no `packages/core`): itinerários com troços, linhas,
   sentido, operador, cores, cais, número de paragens, horas reais e do horário, cancelamentos e
   a geometria (polyline com precisão de 5 a 7). Itinerários incoerentes são ignorados; modos
   desconhecidos (versões futuras do MOTIS) aparecem como "Transporte".
4. **Interface.** Um separador "Transportes públicos" nas direções (a escolha fica guardada).
   A lista mostra as horas, a duração, os transbordos, os metros a pé e as linhas com as cores
   do operador. O texto passa a preto ou branco quando as cores do operador não têm contraste
   AA (4,5:1). Os passos do itinerário escolhido mostram onde entrar e sair, o sentido, o cais e
   as paragens, e ainda o atraso ou adiantamento em tempo real, "A horas", "Hora do horário" ou
   "Cancelado". No mapa, cada troço tem a cor da linha, os troços a pé são ponteados e as
   paragens de entrada e saída são círculos. As opções de estrada, as paragens intermédias e a
   navegação passo a passo não existem neste modo.
5. **Atribuição visível** por baixo dos resultados: ligação para
   [transitous.org/sources](https://transitous.org/sources/) (fontes dos dados e licenças) e
   "© contribuidores do OpenStreetMap", como pede a política de uso, e também no menu "Sobre".

## Política de uso do Transitous (verificada em 2026-10-15)

- O projeto que usa a API tem de ter **código aberto publicado** (antes disso só são aceites
  testes ligeiros de protótipo) e **não pode ser comercial**. O Trajecto tem licença MIT e o
  repositório [MartimC1409/trajecto](https://github.com/MartimC1409/trajecto) é público desde
  2026-10-16.
- **User-Agent** com o nome, a versão e um contacto. Pedidos com User-Agent genérico ou vazio são
  recusados (403).
- **Ligação visível** para a lista de fontes e atribuição ao OpenStreetMap.
- **Limites técnicos:** pedidos de rotas limitados a **20 por minuto por IP** (com margem de 20)
  e 300 por minuto por User-Agent.
- A página pede para **contactar a equipa antes de usar pedidos pesados, como o cálculo de
  rotas**, no canal Matrix `#transitous:matrix.spline.de`. Recomenda-se enviar uma mensagem
  curta a apresentar o Trajecto (rascunho no relatório desta fase).

## Limitações e riscos

- **Sem garantias:** o serviço é comunitário, sem SLA. Se falhar, a app mostra "O serviço de
  transportes (Transitous) está indisponível" e o resto da app continua a funcionar.
- **IP partilhado:** os pedidos saem dos servidores do Vercel, cujo IP pode ser partilhado com
  outros sites. Se esses sites também usarem o Transitous, o limite de 20 pedidos por minuto
  pode chegar mais cedo. Nesse caso a app pede para aguardar um minuto.
- **Cobertura e qualidade dos dados:** dependem dos operadores que publicam horários abertos e
  de o Transitous os incluir. O tempo real só existe onde o operador o publica (GTFS-RT).
  Licenças conhecidas de fontes primárias: Carris Metropolitana CC BY 4.0. Para a Carris,
  o Metro de Lisboa, a STCP e o Metro do Porto, o Transitous indica CC0, mas isso não foi
  confirmado nas fontes primárias; a licença da CP é desconhecida. A app mostra o aviso
  "Horários de fontes abertas reunidas pelo Transitous; podem estar incompletos. Confirma no
  operador antes de viajar."
- **Nomes da partida e da chegada:** a app usa os nomes escolhidos pelo utilizador ("A minha
  localização", a morada) e não os do serviço.
- **Sem navegação passo a passo** nos transportes, nem acesso de bicicleta ou carro à primeira
  paragem (só a pé, o comportamento por omissão do MOTIS).
- **Paragens intermédias** das direções não são usadas neste modo; a app avisa.

## Privacidade (RGPD)

- Vão para o Transitous: a partida e o destino (com 5 casas decimais, ~1 m, incluindo a
  localização atual se for a partida), a hora escolhida e o idioma. Não vão cookies, Referer,
  o IP do utilizador, nem identificadores.
- O Transitous guarda nos registos o IP (o do Vercel), o URL do pedido (que contém os pontos) e
  o User-Agent durante **2 dias**.
- O texto "Sobre" do menu explica isto ao utilizador.

## Verificação

- Testes unitários: pedido, leitura da resposta (precisão 6 e 7, atrasos, cores, modos
  desconhecidos, erros), função `/api/transit` (validação, cabeçalhos, 429, 400/422, falhas e
  tempo esgotado), camadas do mapa, contraste das cores e o fluxo completo no painel.
- Teste ponta a ponta (Chromium no computador e no Android; WebKit no CI) com uma resposta no
  formato do MOTIS v2.11.1: textos, pedido enviado, acessibilidade (axe, tema claro e escuro) e
  CSP sem violações.
- Serviço real (workflow "Serviços reais", 2026-10-15), pela mesma função que corre no Vercel:
  Lisboa Rossio → Alvalade, HTTP 200, 5 ligações, a primeira a pé → metro Vd → a pé; Porto
  Aliados → Asprela, HTTP 200, 5 ligações, a primeira a pé → metro D → a pé.
