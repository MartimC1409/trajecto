# ADR 0009: Backend, dados e tempo real

- **Estado:** Aceite (2026-10-14)
- **Data:** 2026-10-14

## Contexto

O backend é necessário a partir da Fase 2 (rotas). Para um programador individual de nível básico, convém uma só linguagem e poucos serviços.

## Decisão

1. **API (entra na Fase 2):**

   | Componente | Versão |
   |---|---|
   | Node.js LTS | 24.21.0 |
   | TypeScript | **6.0.3** |
   | Fastify | 5.12.7 |
   | `@fastify/swagger` (OpenAPI 3) | 9.9.2 |
   | zod | 4.6.7 |

   - **Porquê o TypeScript 6.0.3 e não o 7.x:** o `typescript-eslint` 8.71.2 exige `typescript <6.1.0`.

2. **Tempo real (entra na Fase 3 ou 4):** WebSocket durante a navegação ativa, com `@fastify/websocket` 11.3.4. Os pontos de velocidade seguem em lotes e os incidentes chegam pelo mesmo canal.
3. **Base de dados (entra na Fase 4 ou 5):** PostgreSQL 18.6 com PostGIS 3.6.4. O PostGIS 3.6.4 requer PostgreSQL 12 a 18.
4. **Cache, limites de frequência e filas (entra na Fase 4):** Valkey 9.1.2 (BSD-3-Clause), com Streams.
   - A fila fica atrás de uma interface, para poder migrar para NATS JetStream 2.15.1 se for preciso.
5. **Transportes públicos (Fase 6):** MOTIS 2.11.3 (MIT), com suporte para GTFS, NeTEx e GTFS-RT. A decisão será confirmada nessa fase.
   - Atualizado pelo [ADR 0015](0015-transportes-publicos-transitous.md): usa-se o MOTIS público do Transitous (v2.11.1), sem servidor próprio.
6. **Testes:**

   | Ferramenta | Versão | Uso |
   |---|---|---|
   | Vitest | 5.0.4 | testes unitários e de integração |
   | Playwright | 1.64.0 | testes ponta a ponta na web |
   | k6 | 2.3.0 | testes de carga |

   Meta de cobertura: ≥80 % na lógica de domínio e ≥70 % nos serviços.

## Consequências

Positivas:

- TypeScript em todo o lado.
- Cada serviço só entra quando é preciso.

Negativas:

- O Node.js é menos eficiente do que Go ou Rust na ingestão de muitos pontos por segundo. Não é relevante à escala de uso pessoal.

## Alternativas consideradas

- **Python (FastAPI):** rejeitado, para evitar duas linguagens.
- **Go:** rejeitado pela curva de aprendizagem.
- **Redis em vez de Valkey:** rejeitado. Desde a versão 7.4 o Redis deixou de ter uma licença puramente BSD.
- **Kafka ou Redpanda:** rejeitados, por serem excessivos para esta escala.
