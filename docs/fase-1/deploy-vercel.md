# Publicar no Vercel para testar no iPhone

O repositório já tem tudo o que o Vercel precisa, em `apps/web/vercel.json`:

- comandos de instalação e build;
- região da função na UE (`cdg1`, Paris);
- os mesmos cabeçalhos de segurança do `pnpm preview`;
- a função `api/geocoder.ts`, que substitui o proxy do Vite em produção.

O plano gratuito (Hobby) é só para uso pessoal e não comercial, o que corresponde ao Trajecto.

## 1. Importar o projeto (uma vez, cerca de 3 minutos)

1. Abre https://vercel.com/new e escolhe a equipa **martim**.
2. Em "Import Git Repository", escolhe **MartimC1409/trajecto** e carrega em **Import**.
3. Em **Root Directory**, carrega em **Edit** e escolhe `apps/web`. O framework fica "Vite" automaticamente. Não mexas nos comandos de build: vêm do `vercel.json`.
4. Abre **Environment Variables** e acrescenta:
   - Name: `ENABLE_EXPERIMENTAL_COREPACK`
   - Value: `1`

   Isto faz o Vercel usar o pnpm 12.11.2 indicado no `package.json`.
5. Carrega em **Deploy**.

> **Erro `No Output Directory named "public" found`:** o Root Directory não ficou definido como `apps/web`. O Vercel construiu a partir da raiz do repositório e não leu o `apps/web/vercel.json`. Corrige em Settings → Build and Deployment → Root Directory → `apps/web` e volta a publicar.

## 2. Escolher o ramo a publicar

O Vercel publica em produção o ramo `main`. Enquanto o trabalho estiver noutro ramo, tens duas opções:

- **Juntar o ramo ao `main`.** É o mais simples: a partir daí, cada `git push` para o `main` atualiza o URL de produção.
- **Mudar o ramo de produção no Vercel:** Settings → Environments → Production → Branch Tracking → `claude/fase-0-planeamento`. Depois, em Deployments, escolhe a última publicação e carrega em **Redeploy**.

## 3. Abrir no iPhone

1. No Safari, abre o URL de produção que o Vercel mostra (algo como `https://trajecto-xxxx.vercel.app`).
   - O acesso depende da proteção do projeto (Settings → Deployment Protection → Vercel Authentication).
     Desde 2026-10-15 o projeto usa a opção `prod_deployment_urls_and_all_previews`: o URL de
     produção (`https://trajecto-psi.vercel.app`) é **público**; as pré-visualizações e os URLs
     próprios de cada publicação (`trajecto-xxxx-martim2.vercel.app`) continuam a pedir login.
     Com a opção `all_except_custom_domains` até o URL de produção pedia login.
2. Para instalar: botão Partilhar → **Adicionar ao ecrã principal**.
   - Usa um URL que não peça login. A app instalada não partilha o login do Safari, por isso mostraria o ecrã de login do Vercel.
3. Com HTTPS, o botão **Mostrar a minha localização** passa a funcionar. O Safari pede autorização na primeira vez.

## Verificar depois de publicar

- `https://<o-teu-url>/geocoder/api?q=Lisboa&limit=2` deve devolver JSON com resultados.
- `https://<o-teu-url>/geocoder/status` deve devolver 404, porque a função só aceita `api` e `reverse`.

## Limitações e privacidade

- **URL público:** quem souber o URL pode usar a app e a função de pesquisa. A função só aceita pesquisas válidas e só fala com o Photon, mas um uso abusivo pode levar o Photon a limitar os pedidos.
- **Registos do Vercel:** o Vercel regista os pedidos à função, incluindo o texto pesquisado e as coordenadas, durante o período de retenção do plano.
- **Sem garantias:** o Photon e o OpenFreeMap são serviços públicos gratuitos sem garantia de disponibilidade.
- **Limites do plano gratuito:** não consegui confirmar os limites exatos na documentação. Para uso por uma pessoa, o consumo é mínimo.
