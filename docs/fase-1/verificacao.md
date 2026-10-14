# Fase 1: verificação e critérios de conclusão

Data: 2026-10-14.

Os resultados abaixo foram obtidos num ambiente Linux com Node.js 24.21.0 e pnpm 12.11.2.

## Resultados automáticos

| Verificação | Comando | Resultado |
|---|---|---|
| Lint (ESLint) | `pnpm lint` | ✅ sem erros nem avisos |
| Formatação (Prettier) | `pnpm format:check` | ✅ |
| Tipos (TypeScript 6.0.3) | `pnpm typecheck` | ✅ |
| Testes unitários `@trajecto/core` | `pnpm test:coverage` | ✅ 62 testes; linhas 100 %, ramos 98,2 % (meta ≥80 %) |
| Testes unitários `@trajecto/web` | `pnpm test:coverage` | ✅ 39 testes; linhas 96,4 %, ramos 82,8 % (meta ≥70 %) |
| Build de produção | `pnpm build` | ✅ |
| Testes ponta a ponta: Chromium desktop e Android | `pnpm test:e2e` | ✅ 21 passaram, 1 ignorado de propósito (o teste de toque não se aplica ao desktop) |
| Acessibilidade WCAG 2.2 AA (axe-core) | incluído no `pnpm test:e2e` | ✅ 0 violações nos temas claro e escuro, com resultados de pesquisa, painel do local e menu abertos |
| CSP e cabeçalhos de segurança | incluído no `pnpm test:e2e` | ✅ sem violações de CSP |
| Proxy da pesquisa (servidor local de eco) | manual | ✅ User-Agent enviado; `Cookie` e `Referer` removidos; POST recusado com 405 |

### Não verificado aqui

- **WebKit (Safari de iPhone):** não está instalado neste ambiente. Corre no CI (`E2E_WEBKIT=1`) e no Windows.
- **Tiles reais e Photon real:** a rede deste ambiente bloqueia os dois serviços. Os testes usam respostas locais.
  A verificação com os serviços reais é o item 2 da lista abaixo.

## Lista de verificação manual (para fazeres tu)

1. [ ] Seguir o [guia de instalação no Windows](guia-instalacao-windows.md) até `pnpm dev` funcionar.
2. [ ] O mapa de Portugal aparece com ruas, nomes e rios. Em zoom 15 ou mais, com o mapa inclinado, os edifícios aparecem em 3D.
3. [ ] Pesquisar "Rua Augusta", "Sé de Braga" e um código postal (por exemplo "4000-322"):
   - os resultados aparecem em menos de 1 s;
   - clicar ou carregar em Enter centra o mapa.
4. [ ] Clicar no mapa mostra a morada; "Que sítio é este?" mostra a morada do centro.
5. [ ] Guardar Casa, Trabalho e um Favorito; recarregar a página; continuam lá.
6. [ ] Apagar um favorito, uma entrada do histórico e depois "Apagar todos os meus dados".
7. [ ] Tema escuro e claro, nas definições e seguindo o sistema.
8. [ ] No iPhone (Safari) e no Android (Chrome) com `pnpm dev:lan`:
   - o mapa, a pesquisa e o painel inferior funcionam;
   - "Adicionar ao ecrã principal" mostra o ícone do Trajecto.
9. [ ] Com o teclado apenas (Tab, setas, Enter, Escape) consegues pesquisar, escolher e abrir e fechar o menu.
10. [ ] `pnpm check` e `pnpm test:e2e` passam no teu computador.
