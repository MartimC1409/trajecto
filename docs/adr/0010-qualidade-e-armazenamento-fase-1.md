# ADR 0010: Qualidade, acessibilidade e armazenamento local (Fase 1)

- **Estado:** Aceite (2026-10-14)
- **Data:** 2026-10-14

## Contexto

A Fase 1 introduz o primeiro código. Antes de o escrever foi preciso escolher as ferramentas de
qualidade e o armazenamento local, e verificar se as versões são compatíveis entre si.

## Decisão

1. **Lint:**
   - ESLint 10.12.0 com `typescript-eslint` 8.71.2 (configuração `strict`) e `eslint-plugin-react-hooks` 7.1.1.
   - **Fica de fora o `eslint-plugin-jsx-a11y` 6.10.2:** só declara suporte até ao ESLint 9 e não tem versões novas desde outubro de 2024.
2. **Acessibilidade:**
   - Verificação automática com **axe-core** (`@axe-core/playwright` 4.13.0, MPL-2.0) nos testes ponta a ponta. Os critérios são WCAG 2.0, 2.1 e 2.2 nível AA, nos temas claro e escuro.
   - Consultas por papel e nome acessível (Testing Library) nos testes unitários.
3. **TypeScript 6.0.3:** o `typescript-eslint` 8.71.2 exige `typescript <6.1.0`.
4. **Formatação:** Prettier 3.9.10. O Markdown fica excluído, para não reformatar as tabelas dos documentos.
5. **Testes:**

   | Tipo | Ferramenta | Versão | Âmbito |
   |---|---|---|---|
   | Unitários | Vitest | 5.0.4 | `jsdom` 30.1.2 na interface |
   | Ponta a ponta | Playwright | 1.64.0 | Chromium (desktop e Android), mais WebKit para iPhone no CI |

   - Os serviços externos são substituídos por respostas locais, para os testes serem repetíveis e não sobrecarregarem servidores públicos.
   - Metas de cobertura: ≥80 % em `packages/core` e ≥70 % em `apps/web`. O mapa (WebGL) é coberto pelos testes ponta a ponta.
6. **CI:** GitHub Actions. As ações estão fixadas por *commit* (SHA), o que protege contra etiquetas alteradas.
7. **Armazenamento local:**
   - Usa-se o `localStorage` em vez do IndexedDB, porque os dados são pequenos (até 100 favoritos e 20 entradas de histórico). A API é síncrona e mais simples.
   - Os dados são validados com zod ao ler. Dados corrompidos são ignorados sem bloquear a app.
   - Se o browser recusar gravar, a app continua em memória e mostra um aviso.
8. **Pesquisa através de um proxy local do Vite** (`/geocoder`):
   - evita depender de CORS no servidor público;
   - permite identificar a aplicação (User-Agent);
   - na Fase 2, permite trocar pela API própria sem mudar o cliente.
9. **Segurança da versão de produção:** política de segurança de conteúdo (CSP) estrita, sem `unsafe-inline` nem `unsafe-eval`, e `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`. Tudo testado nos testes ponta a ponta.

## Consequências

Positivas:

- Erros de layout, de estilo do mapa e de acessibilidade são apanhados automaticamente.
- A Fase 1 apanhou três erros reais:
  - uma expressão de zoom inválida no estilo do mapa;
  - o mapa com só 300 px de altura, por causa da ordem do CSS;
  - os controlos do mapa por cima do campo de pesquisa no telemóvel.

Negativas:

- **Sem lint de acessibilidade em JSX:** um problema pode passar até aos testes ponta a ponta.
- **Os testes automáticos não substituem testes manuais** com leitor de ecrã (VoiceOver, TalkBack).
- **Safari:** apaga o armazenamento de sites que não usaste nos últimos 7 dias de utilização do browser. As PWA adicionadas ao ecrã principal não estão sujeitas a essa regra. Recomendação: instalar a app no ecrã principal do iPhone.
- **Proxy só local:** existe apenas em `pnpm dev` e `pnpm preview`. Publicar a versão estática noutro sítio exige um proxy equivalente (Fase 2 ou Fase 7).
