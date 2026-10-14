# ADR 0007: Privacidade dos dados de localização

- **Estado:** Proposto
- **Data:** 2026-10-14

## Contexto

A localização é um dado pessoal. Enquanto o uso for estritamente pessoal, o RGPD não se aplica, por força da exceção de atividade pessoal ou doméstica (art. 2.º, n.º 2, alínea c). Aplica-se logo que outras pessoas usem a app. Para não ter de refazer o sistema mais tarde, aplicamos já a privacidade desde a conceção.

## Decisão

1. **Partilha de velocidade anónima:** é *opt-in*, desligada por omissão e revogável a qualquer momento.
2. **No dispositivo:**
   - não se enviam pontos dos primeiros e últimos ~500 m de cada viagem;
   - o identificador de sessão é aleatório e muda a cada 10 a 15 minutos;
   - os envios não levam ID de utilizador;
   - o tempo é arredondado ao segundo.
3. **No servidor:**
   - os pontos em bruto são apagados depois da agregação (meta: minutos, nunca mais de 24 h);
   - só se guardam agregados por segmento de estrada, e só são usados com pelo menos 3 sessões distintas;
   - os endereços IP não ficam nos registos dos endpoints de localização.
4. **Direitos do titular, quando houver contas:** exportação (`GET /v1/me/export`) e apagamento (`DELETE /v1/me`). Os reportes de contas apagadas são anonimizados.
5. **Antes de abrir a app a outras pessoas:**
   - política de privacidade em pt-PT;
   - avaliação de impacto (AIPD, art. 35.º);
   - alojamento na UE.

## Consequências

Positivas:

- Pronto para um eventual alargamento do uso.

Negativas:

- Com um só utilizador e a agregação mínima de 3 sessões, o trânsito calculado a partir dos próprios dados será praticamente inexistente. É uma limitação assumida.
