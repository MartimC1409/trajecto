# ADR 0005: Custo zero: execução local e serviços públicos gratuitos

- **Estado:** Aceite (2026-10-14)
- **Data:** 2026-10-14

## Contexto

O projeto é para uso pessoal e não tem orçamento.

## Decisão

1. **Ferramentas locais:** o desenvolvimento e a execução decorrem no computador do utilizador.

   | Ferramenta | Versão | Quando entra |
   |---|---|---|
   | Node.js LTS | 24.21.0 | Fase 1 |
   | pnpm | 12.11.2 | Fase 1 |
   | Git | — | Fase 1 |
   | Docker | — | só a partir da Fase 2 |

2. **Serviços públicos gratuitos, dentro dos respetivos limites:**
   - OpenFreeMap (tiles);
   - Photon público (pesquisa);
   - IPMA (meteorologia, mediante contacto prévio);
   - Open-Meteo (previsão; plano gratuito apenas para uso não comercial, menos de 10 000 chamadas por dia).
3. **Nenhum serviço pago** é adicionado sem aprovação explícita do utilizador.
4. **Uso no telemóvel (a partir da Fase 3):** a geolocalização exige um endereço HTTPS. As opções gratuitas (por exemplo, um túnel seguro até ao computador de casa, ou alojamento gratuito para a parte estática) serão avaliadas na Fase 3, com os termos e limites verificados nessa altura.

## Consequências

Positivas:

- Custo zero.
- Os dados ficam no computador do utilizador.

Negativas:

- O backend só está disponível com o computador ligado.
- Dependemos da disponibilidade de serviços públicos sem SLA.
- O desempenho depende da máquina local (RAM e disco a confirmar).
