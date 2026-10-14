# ADR 0008: Reportes de polícia

- **Estado:** Aceite (2026-10-14)
- **Data:** 2026-10-14

## Contexto

O utilizador quer reportes de polícia, para uso pessoal.

A ANSR publica a lista de radares fixos. Para os avisos de presença policial, não encontrei confirmação legal em Portugal: as fontes consultadas foram notícias, não textos legais.

## Decisão

1. O tipo de reporte `police` é incluído atrás de um interruptor de funcionalidade (`reports.police`), **ligado** enquanto o uso for pessoal.
2. Os reportes de polícia guardam só o tipo, a posição e a hora. Não guardam fotografias, matrículas nem descrições de pessoas.
3. Expiram mais depressa do que os outros tipos. O valor exato será definido na Fase 5, com 60 minutos como ponto de partida.
4. Os radares fixos são um tipo separado (`speed_camera`), alimentado pela lista pública da ANSR e pela etiqueta OSM `highway=speed_camera`. Os termos de reutilização serão verificados na Fase 5.
5. **Antes de partilhar a app com outras pessoas,** é obrigatória uma revisão legal (Código da Estrada e regras sobre avisos de fiscalização). Se o resultado for negativo, o interruptor é desligado.

## Consequências

Positivas:

- A funcionalidade existe.
- Pode ser desligada sem alterar código.

Negativas:

- Risco legal por confirmar se o âmbito de uso mudar.
