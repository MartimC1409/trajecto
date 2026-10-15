# Fase 4: meteorologia na rota, verificação

Data: 2026-10-15.

Os resultados abaixo foram obtidos num ambiente Linux com Node.js 24.21.0 e pnpm 12.11.2.
Decisões, limites e termos: [ADR 0012](../adr/0012-meteorologia-na-rota.md).

## O que foi feito

- **Meteorologia na rota:** ao escolher uma rota, o painel de direções mostra a previsão do
  tempo à hora em que vais passar em cada ponto (um ponto a cada 15 km, no máximo 10).
- **Avisos:** chuva forte, trovoada, neve, risco de gelo, nevoeiro ou pouca visibilidade,
  rajadas fortes e calor intenso, com a hora e o km onde começam. São avisos do Trajecto com
  limiares próprios, não avisos oficiais do IPMA (está escrito na interface).
- **Previsão ponto a ponto:** km, hora, estado do céu, temperatura, precipitação e rajadas.
- **Hora de partida:** funciona com "partir agora", "partir às" e "chegar às", até 7 dias.
- **Privacidade:** o Open-Meteo só recebe o IP do servidor do Trajecto e pontos arredondados a
  ~100 m.

O que **não** foi feito, e porquê (ADR 0012): trânsito a partir de dados próprios e tempos de
chegada com trânsito. O servidor público do Valhalla não aceita dados de trânsito e, com um só
utilizador, não haveria dados suficientes.

## Resultados automáticos

| Verificação | Comando | Resultado |
|---|---|---|
| Lint, formatação e tipos | `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | ✅ |
| Testes unitários `@trajecto/core` | `pnpm test:coverage` | ✅ 151 testes; linhas 99,5 % |
| Testes unitários `@trajecto/web` | `pnpm test:coverage` | ✅ 187 testes; linhas 97,9 % |
| Build de produção | `pnpm build` | ✅ |
| Testes ponta a ponta (com meteorologia simulada) | `pnpm test:e2e` | ✅ |

### Não verificado aqui

- **Open-Meteo real:** a rede deste ambiente bloqueia o serviço. O formato foi confirmado na
  documentação oficial; a verificação real é o item 1 da lista abaixo.

## Lista de verificação manual (no iPhone)

1. [ ] Pedir direções para um destino a mais de 30 km: aparece "Meteorologia na rota" com
   avisos ou "Sem avisos de tempo previstos na rota".
2. [ ] Tocar em "Ver previsão ponto a ponto": as horas aumentam ao longo do percurso e as
   temperaturas parecem razoáveis para hoje.
3. [ ] Em "Opções de rota", escolher "Partir às" amanhã de manhã: as horas da previsão mudam.
4. [ ] Escolher "Partir às" daqui a 10 dias: aparece "A previsão só está disponível para os
   próximos 7 dias".
