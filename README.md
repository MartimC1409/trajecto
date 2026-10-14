# Trajecto

Aplicação pessoal de mapas e navegação para Portugal, em português europeu.
É uma aplicação web instalável no telemóvel (PWA).

> **Estado: Fase 1 concluída, a aguardar validação.** Já há mapa, pesquisa, favoritos e histórico.
> Rotas, navegação e alertas chegam nas fases seguintes ([plano](docs/fase-0-planeamento.md)).

## O que já funciona (Fase 1)

- **Mapa vetorial:** zoom, rotação e inclinação (edifícios em 3D), modo claro e escuro.
- **Pesquisa:** autocompletar em Portugal, navegação com teclado e mensagens de erro claras.
- **Morada de um ponto:** clica no mapa ou usa "Que sítio é este?" (funciona só com teclado).
- **Favoritos e histórico:** Casa, Trabalho e favoritos, mais um histórico de pesquisas.
  - Ficam só no teu dispositivo e podes apagar cada entrada ou tudo de uma vez.
  - Podes desligar o histórico.
- **Língua:** português europeu, com inglês disponível.
- **Acessibilidade:** verificada automaticamente segundo a WCAG 2.2 AA (axe-core), com áreas de toque de 44 px.

## Começar

- **Windows, passo a passo:** [docs/fase-1/guia-instalacao-windows.md](docs/fase-1/guia-instalacao-windows.md).
- **Resumo:** precisas de [Node.js 24.21.0 LTS](https://nodejs.org/) e de pnpm 12.11.2.

```sh
npm install -g pnpm@12.11.2
pnpm install
pnpm dev          # abre http://localhost:5173
```

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Arranca a app em modo de desenvolvimento em http://localhost:5173 |
| `pnpm dev:lan` | O mesmo, acessível a partir do telemóvel na mesma rede Wi-Fi |
| `pnpm build` | Cria a versão de produção em `apps/web/dist` |
| `pnpm preview` | Serve a versão de produção em http://localhost:4173, com cabeçalhos de segurança |
| `pnpm check` | Lint, formatação, tipos, testes unitários com cobertura e build (o mesmo que o CI) |
| `pnpm test` | Só os testes unitários |
| `pnpm test:e2e` | Testes ponta a ponta com Playwright (ver o guia para instalar os browsers) |
| `pnpm format` | Formata o código com Prettier |

## Estrutura

```text
trajecto/
├─ apps/web/            # Aplicação web (Vite + React + MapLibre GL JS)
│  ├─ src/              # Componentes, mapa, i18n, testes unitários
│  ├─ e2e/              # Testes ponta a ponta (Playwright + axe-core)
│  └─ public/           # Manifesto da PWA e ícones
├─ packages/core/       # Lógica de domínio sem browser (pesquisa, favoritos, preferências)
└─ docs/                # Plano, decisões de arquitetura (ADR) e guias
```

## Configuração

Os valores por omissão funcionam sem configuração. Para os mudar, copia
`apps/web/.env.example` para `apps/web/.env.local` e edita-o. Nunca coloques segredos nesse
ficheiro: as variáveis `VITE_*` ficam visíveis no browser.

## Serviços externos, limites e privacidade

| Serviço | Para quê | Limites e termos |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org) | Tiles do mapa | Gratuito e sem chave; atribuição obrigatória; **sem garantia de disponibilidade (SLA)** |
| [Photon (komoot)](https://photon.komoot.io) | Pesquisa e moradas | Servidor público para uso "num limite razoável". Uso intensivo é limitado ou bloqueado e não há garantias. Por isso a app espera 300 ms depois de escreveres (*debounce*), exige 3 letras, guarda resultados em cache e cancela pedidos antigos |

Estes serviços recebem o teu endereço IP, o que pesquisas e as zonas do mapa que vês.
Os teus favoritos, histórico e definições **nunca saem do dispositivo**.

## Atribuições e licenças de dados

- Dados do mapa © [contribuidores do OpenStreetMap](https://www.openstreetmap.org/copyright), licença ODbL.
- Esquema de tiles © [OpenMapTiles](https://www.openmaptiles.org/), CC-BY 4.0.
- Fontes Noto Sans: SIL Open Font License 1.1.

## Documentação

- [Fase 0: planeamento, stack e requisitos](docs/fase-0-planeamento.md)
- [Decisões de arquitetura (ADR)](docs/adr/README.md)
- [Guia de instalação no Windows](docs/fase-1/guia-instalacao-windows.md)
- [Publicar no Vercel para testar no iPhone](docs/fase-1/deploy-vercel.md)
