# Instalar o Trajecto no telemóvel e usá-lo sem rede

O Trajecto é uma aplicação web (PWA): instala-se a partir do browser, sem loja de apps, e é
gratuita. Endereço: <https://trajecto-psi.vercel.app>.

## iPhone (Safari)

1. Abre o endereço no **Safari** (noutros browsers do iPhone a opção pode não aparecer).
2. Toca no botão **Partilhar** (o quadrado com uma seta para cima). Se não o vires, procura-o no
   menu **⋯**.
3. Escolhe **Adicionar ao ecrã principal** e depois **Adicionar**.
4. Abre o Trajecto pelo ícone novo no ecrã principal.

No iPhone, instala a app antes de guardar mapas: o Safari pode apagar os dados de sites que não
abres há vários dias; as apps no ecrã principal ficam de fora dessa limpeza
([ADR 0016](../adr/0016-mapas-offline.md)).

## Android (Chrome)

1. Abre o endereço no **Chrome**.
2. Toca no menu **⋮** (canto superior direito) e escolhe **Instalar app** ou **Adicionar ao ecrã
   principal**. O Chrome também pode mostrar um aviso para instalar.
3. Confirma. A app aparece no ecrã principal e na lista de apps.

## Computador (Chrome ou Edge)

Na barra de endereço aparece um ícone de instalação; também está no menu do browser
(**Instalar Trajecto**).

## Guardar mapas para usar sem rede

1. Com rede, abre a app e põe no ecrã a zona que queres guardar (por exemplo, a cidade de destino).
2. Abre o **menu** → **Mapas offline**. A app mostra uma estimativa do tamanho.
3. Toca em **Guardar esta zona** e espera pela mensagem «… está guardada». Podes cancelar e
   continuar mais tarde.
4. Cada zona tem no máximo 3000 tiles e 50 MB (limites dos termos do OpenFreeMap). Numa cidade, uma
   zona chega a cerca de 25 km × 25 km; zonas maiores guardam-se em várias partes. Podes guardar
   até 20 zonas.

## Experimentar sem rede

1. Guarda uma zona (acima).
2. Liga o **modo de avião**.
3. Abre o Trajecto pelo ícone. Deves ver:
   - [ ] a app abre (sem página de erro do browser);
   - [ ] o aviso «Sem rede: o mapa mostra só as zonas guardadas»;
   - [ ] o mapa da zona guardada, com ruas e nomes;
   - [ ] fora das zonas guardadas, o mapa fica em branco (é normal).
4. Para navegar sem rede, calcula a rota **antes** de perderes a rede e guarda as zonas por onde
   vais passar. Sem rede, a navegação continua com a rota calculada. Se saíres da rota, a app avisa
   que não dá para recalcular e recalcula quando a rede voltar
   ([ADR 0017](../adr/0017-rotas-sem-rede.md)).

Sem rede não há pesquisa de moradas, cálculo de rotas, transportes públicos nem meteorologia.

## Apagar

- Uma zona: menu → **Mapas offline** → **Apagar** nessa zona.
- Tudo (favoritos, histórico, definições, reportes e mapas): menu → **Apagar todos os dados**.
- A app: como qualquer outra app do telemóvel (no iPhone, carrega no ícone e escolhe **Remover
  app**).
