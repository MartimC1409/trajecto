# ADR 0002: Motor de rotas: Valhalla

- **Estado:** Aceite (2026-10-14)
- **Data:** 2026-10-14

## Contexto

Os requisitos pedem:

- os modos carro, mota, a pé, bicicleta e mobilidade reduzida;
- preferências em cada pedido (evitar portagens, autoestradas ou ferries; rota mais curta);
- rotas dependentes da hora (partir ou chegar a uma hora definida);
- trânsito ao vivo e histórico;
- instruções em pt-PT;
- *map matching* (encaixar trajetos GPS na rede de estradas) para os dados anónimos de velocidade.

## Decisão

- **Motor:** Valhalla **3.9.1** (licença MIT), a correr localmente em Docker a partir da Fase 2.
- **Imagem Docker:** a imagem oficial e a respetiva tag serão confirmadas na Fase 2.
- **Funcionalidades confirmadas na documentação da 3.9.1:**
  - perfis `auto`, `motorcycle`, `bicycle` e `pedestrian` (incluindo `wheelchair`);
  - opções `exclude_tolls`, `exclude_highways`, `exclude_ferries` e `shortest`;
  - `date_time` para hora de partida ou chegada, e `alternates` para rotas alternativas;
  - locale `pt-PT`;
  - `format=osrm` com `voice_instructions` e `banner_instructions`;
  - trânsito ao vivo (`traffic.tar`) e velocidades previstas;
  - `trace_attributes` para *map matching*.

## Consequências

Positivas:

- Um só grafo serve todos os modos.
- Usa pouca memória (tiles com *memory map*).
- Pode ser atualizado com trânsito sem reiniciar.

Negativas:

- Em rotas muito longas é mais lento do que o OSRM com Contraction Hierarchies. À escala de Portugal não é relevante; será medido com k6 na Fase 2, com meta de p95 abaixo de 2 s.
- A documentação está dispersa.
- O modo multimodal do Valhalla não usa trânsito. Os transportes públicos ficam no MOTIS, decidido na Fase 6.

## Alternativas consideradas

- **OSRM v26.10.0 (BSD-2-Clause):** é o mais rápido, mas precisa de uma instância por modo e não suporta rotas dependentes da hora.
- **GraphHopper 11.1 (Apache-2.0):** é flexível, mas o trânsito dependente da hora não está confirmado na versão open source, e a JVM consome mais memória.
