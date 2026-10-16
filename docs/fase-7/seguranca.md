# Fase 7: revisão de segurança (OWASP) e privacidade

Data: 2026-10-16. Referência: OWASP ASVS (Application Security Verification Standard), nível 1,
por capítulo. A app não tem contas, sessões nem base de dados no servidor; as funções do Vercel
só reencaminham pedidos para serviços públicos.

## Resumo

| Área (capítulo do ASVS) | Estado | Evidência |
|---|---|---|
| Codificação e saída (injeção, XSS) | ✅ | O React escapa o texto. O único HTML inserido é o dos ícones da própria app (constantes). Nomes de locais, linhas e moradas são sempre texto; as cores das linhas só passam se forem `#rrggbb`. |
| Validação de entradas | ✅ | Todas as funções validam os parâmetros com expressões fechadas (coordenadas, área suportada, horas, versões, zoom). As respostas dos serviços externos são validadas com `zod` antes de chegar à interface. |
| Segurança do frontend | ✅ | CSP sem `unsafe-inline` nem `unsafe-eval` (o `zod` corre sem `eval`), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Novos nesta revisão: HSTS, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-Frame-Options`. Ligações externas com `rel="noopener noreferrer"`. |
| APIs (funções do Vercel) | ✅ com limites | Só GET (POST nas rotas, com corpo limitado). Servidor de destino fixo (sem SSRF), redirecionamentos recusados, tempo e tamanho máximos, só cabeçalhos próprios (sem cookies, Referer ou IP do visitante). Pedidos de outros sites recusados em todas as funções (nesta revisão: também meteorologia e pesquisa). Ver "Abuso das funções". |
| Ficheiros | ✅ | Não há envio de ficheiros. O ficheiro de radares é estático e validado. |
| Autenticação, sessões, autorização, tokens | — | Não existem (sem contas). |
| Criptografia | — | Não guarda segredos; o HTTPS é do Vercel. |
| Comunicações | ✅ | Só HTTPS (Vercel); HSTS de 2 anos. Serviços externos só por HTTPS. |
| Configuração | ✅ | Dependências com versões exatas e `pnpm-lock.yaml`; `pnpm audit` sem vulnerabilidades conhecidas (2026-10-16). Ações do GitHub fixadas por SHA; permissões mínimas (`contents: read`, exceto os dois workflows que publicam dados). Sem segredos no repositório nem no histórico (procura de padrões de chaves, tokens e chaves privadas: nada encontrado). |
| Proteção de dados | ✅ | Favoritos, histórico, definições, reportes e mapas guardados ficam só no dispositivo; "Apagar todos os dados" apaga tudo (incluindo os mapas). Respostas com posições têm `Cache-Control: private`. Sem análise de utilização, cookies ou identificadores. |
| Código e arquitetura | ✅ | Decisões em ADR. Testes unitários (cobertura ≥ 95%) e ponta a ponta com a CSP ativa, incluindo acessibilidade. |
| Registos e erros | ✅ | As funções devolvem erros genéricos (sem detalhes internos). A app não regista dados pessoais na consola. |

## Abuso das funções (risco principal)

As funções não têm autenticação (a app não tem contas). Alguém pode chamá-las fora da app:

- **`/api/offline-tile`** usa o User-Agent da app nos pedidos ao OpenFreeMap. Usada em massa por
  terceiros, a app poderia ser bloqueada. Mitigações nesta revisão:
  - o pedido tem de trazer `Sec-Fetch-Site: same-origin` (os browsers enviam-no sempre; um
    programa tem de o falsificar de propósito);
  - tiles de uma versão ficam na CDN do Vercel durante 30 dias (`s-maxage`): pedidos repetidos não
    voltam ao OpenFreeMap;
  - só tiles da área suportada, até ao zoom 14.
- **Rotas, transportes, meteorologia e pesquisa:** os serviços públicos limitam por IP, e o IP é o
  do Vercel; um abuso pode esgotar esse limite e deixar a app sem o serviço durante algum tempo.

**Recomendado (opcional, no painel do Vercel):** uma regra de limite por IP na firewall
(Vercel → projeto → Firewall → Custom Rules → Rate limit), por exemplo:

| Caminho | Limite por IP | Porquê |
|---|---|---|
| `/api/offline-tile` | 1000 pedidos por minuto | Uma zona tem até 3000 tiles (4 em paralelo, alguns minutos) |
| `/api/route`, `/api/transit`, `/api/weather`, `/geocoder` | 60 pedidos por minuto | Uso normal: poucos pedidos por minuto |

A documentação do Vercel descreve estas regras, mas não foi possível confirmar se o plano
gratuito as inclui, nem configurá-las a partir desta sessão (sem permissões no Vercel).

## Privacidade (RGPD)

- Minimização: as funções reconstroem cada pedido só com os campos necessários; pontos
  arredondados (meteorologia: ~100 m; transportes: 5 casas decimais).
- Transparência: o menu "Sobre" explica o que vai para cada serviço (Photon, OpenFreeMap,
  Mapterhorn, Valhalla, Open-Meteo, Transitous) e o que fica no dispositivo.
- Controlo: histórico desligável; reportes e mapas guardados apagáveis; "Apagar todos os dados".
- Conservação nos serviços externos: Transitous 2 dias (IP do Vercel, URL, User-Agent);
  Mapterhorn até 30 dias (IP e zonas vistas, com o relevo ligado). Os registos do Vercel incluem os
  URLs pedidos às funções (com coordenadas).

## Recomendações para o repositório (definições do GitHub, opcionais)

- **Dependabot alerts** (Settings → Code security): avisos de vulnerabilidades novas nas
  dependências.
- **Code scanning → CodeQL "Default setup"** (Settings → Code security): análise estática
  gratuita em repositórios públicos, sem ficheiros novos no repositório.
- **Secret scanning e push protection** (Settings → Code security): bloqueia o envio de chaves
  por engano.

## Verificação desta revisão

- `pnpm audit` (todas as dependências e só as de produção): sem vulnerabilidades conhecidas.
- Testes novos: pedidos de outros sites recusados na meteorologia e na pesquisa; pedidos sem
  origem recusados em `/api/offline-tile`; cabeçalhos de cache da CDN; cabeçalhos de segurança
  iguais no `vercel.json` e no `pnpm preview`.
- Testes ponta a ponta (37) com os cabeçalhos novos: sem violações da CSP e sem falhas.
