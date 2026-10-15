# Fase 6: transportes públicos, verificação

Data: 2026-10-15.

Os resultados abaixo foram obtidos num ambiente Linux com Node.js 24.21.0 e pnpm 12.11.2.
Decisões, política de uso, licenças e limites: [ADR 0015](../adr/0015-transportes-publicos-transitous.md).

## O que foi feito

- **Separador "Transportes públicos"** nas direções, ao lado de carro, mota, a pé e bicicleta.
  A escolha fica guardada.
- **Ligações** do Transitous (horários abertos de Portugal e da Europa): horas de partida e
  chegada, duração, transbordos, metros a pé e as linhas com as cores do operador.
- **Passos da ligação escolhida:** a pé até à paragem, sentido, onde entrar e sair, cais, número
  de paragens, operador e o estado em tempo real (atraso, adiantamento, "A horas", "Hora do
  horário" ou "Cancelado").
- **No mapa:** cada troço com a cor da linha, os troços a pé ponteados, as paragens de entrada e
  saída marcadas, e a câmara a mostrar o percurso todo sem ficar por baixo do painel.
- **Hora:** "Partir agora", "Partir às" e "Chegar às".
- **Atribuição** visível por baixo dos resultados e no menu "Sobre".
- **Também corrigido:** no telemóvel, o fim das rotas (de carro e de transportes) ficava por
  baixo do painel de direções.

## Resultados automáticos

| Verificação | Resultado |
|---|---|
| Lint (ESLint) e formatação (Prettier) | Sem erros |
| TypeScript (`tsc --noEmit`, core e web) | Sem erros |
| Testes unitários (core) | 175 passaram; cobertura 99,1 % das instruções |
| Testes unitários (web) | 327 passaram, 8 ignorados (só correm contra os serviços reais); cobertura 96,4 % |
| Build de produção | Sem erros |
| Testes ponta a ponta (Chromium no computador e no Android) | 35 passaram, 1 ignorado (WebKit corre no CI) |
| Acessibilidade (axe, WCAG 2.2 AA) no painel de transportes, tema claro e escuro | Sem violações |
| CSP em produção (`pnpm preview`) com transportes | Sem violações |
| Serviço real (GitHub Actions, função do Vercel → Transitous) | Lisboa e Porto: HTTP 200, 5 ligações cada |

## Como testar no telemóvel

1. Abre o site e pesquisa um destino em Lisboa ou no Porto (por exemplo "Estação do Oriente").
2. Toca em **Direções** e depois em **Transportes públicos**.
3. Confirma:
   - [ ] aparecem ligações com horas, duração e linhas coloridas (por exemplo metro, autocarro);
   - [ ] ao tocar numa ligação, o mapa mostra o percurso com a cor da linha e os troços a pé
     ponteados;
   - [ ] os passos dizem onde entrar e sair e, quando há tempo real, o atraso;
   - [ ] "Opções de rota" → "Chegar às" muda as ligações para chegares a horas;
   - [ ] a ligação "Ligações por Transitous (fontes dos dados e licenças)" abre a lista de fontes;
   - [ ] ao voltar a "Carro", aparecem de novo as rotas de carro e o botão "Iniciar".
4. Fora de Portugal e de Espanha, ou num sítio sem transportes, aparece uma mensagem clara (sem
   erro técnico).

## Limitações conhecidas

- Sem navegação passo a passo nos transportes públicos.
- A cobertura e o tempo real dependem dos operadores; os horários podem estar incompletos.
- O serviço é comunitário, sem garantia de disponibilidade, e tem limite de 20 pedidos por
  minuto por IP (o IP é o do servidor do Vercel).
- A política do Transitous exige que o código esteja publicado: o repositório no GitHub tem de
  ficar **público**.
