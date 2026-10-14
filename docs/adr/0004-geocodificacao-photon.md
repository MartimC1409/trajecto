# ADR 0004: Geocodificação: Photon

- **Estado:** Proposto
- **Data:** 2026-10-14

## Contexto

A pesquisa precisa de autocompletar, geocodificação direta (texto → coordenadas) e inversa (coordenadas → morada), sem custos.

## Decisão

- **Motor:** Photon (licença Apache-2.0).
- **Fase 1:** usar o servidor público `photon.komoot.io`. O README oficial do Photon 1.3.0 diz que o servidor público pode ser usado "desde que o número de pedidos se mantenha num limite razoável". O uso intensivo é limitado ou bloqueado, e não há garantias de disponibilidade.
- **Regras no cliente, para respeitar esse limite:**
  - *debounce* de 300 ms;
  - mínimo de 3 caracteres;
  - cache local dos resultados;
  - cancelamento de pedidos obsoletos;
  - prioridade a resultados em Portugal.
- **Quando houver mais uso, ou se o servidor público falhar:** passar a uma instância própria do **Photon 1.3.0** (Java 21+) em Docker, com o *dump* de Portugal. A disponibilidade desse *dump* em `download1.graphhopper.com` será confirmada nessa altura.
- **Configuração:** o endereço do servidor de pesquisa fica numa variável de configuração, para a troca não exigir mudanças de código.

## Consequências

Positivas:

- Fase 1 sem servidor próprio nem Docker.

Negativas:

- O Photon é menos rigoroso com números de porta do que o Nominatim.
- O servidor público pode falhar ou mudar sem aviso.
- **Privacidade:** o operador do servidor público (komoot) recebe o texto pesquisado, as coordenadas da geocodificação inversa e o teu endereço IP. A instância própria elimina esta exposição.

## Alternativas consideradas

- **Nominatim público:** rejeitado. Permite no máximo 1 pedido por segundo e não está desenhado para autocompletar.
- **Nominatim 5.3.2 próprio (GPL-3.0):** importação pesada e pouco adequado ao autocompletar.
