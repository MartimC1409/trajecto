# ADR 0013: Fase 5 — reportes no dispositivo e radares fixos do OpenStreetMap

- **Estado:** Aceite (2026-10-15)
- **Data:** 2026-10-15
- **Atualiza:** [ADR 0008](0008-reportes-de-policia.md) (ponto 4, fonte dos radares) e o plano da
  Fase 5 (secção 9 de [`../fase-0-planeamento.md`](../fase-0-planeamento.md))

## Contexto

O plano da Fase 5 previa reportes da comunidade ao estilo do Waze (polícia, acidentes, perigos,
trânsito, obras, estradas cortadas), confirmações e avisos de radares fixos.

Hoje o Trajecto tem um só utilizador, orçamento zero e nenhum servidor com base de dados
(ADR 0009 previa PostgreSQL só "na Fase 4 ou 5"). Partilhar reportes entre pessoas exige um
servidor, contas ou proteção contra abuso, e uma revisão legal antes de os reportes de polícia
serem vistos por outras pessoas (ADR 0008, ponto 5).

## Decisão

1. **Reportes no dispositivo (feito):**
   - seis tipos: polícia, acidente, perigo na via, trânsito parado, obras e estrada cortada;
   - guardam só o tipo, a posição arredondada a 5 casas decimais (~1 m), a direção de quem
     reportou (se estava em andamento) e as horas; nunca fotografias, matrículas ou descrições;
   - tempo de vida: polícia 60 min (ADR 0008), trânsito parado 60 min, acidente e perigo 120 min,
     estrada cortada 24 h, obras 7 dias. "Ainda lá está" volta a contar o tempo; "Já não está"
     apaga o reporte;
   - no máximo 200 reportes; os expirados são apagados sozinhos;
   - reportar durante a navegação (botão "Reportar") ou num ponto do mapa ("Reportar aqui");
   - os reportes de polícia continuam atrás do interruptor do ADR 0008 (ligado por omissão).
2. **Avisos na rota (feito):** durante a navegação, os reportes e radares que ficam em cima da
   rota (até 30 m e no mesmo sentido, quando têm direção) aparecem no ecrã a partir de 2 km e são
   ditos em voz alta uma vez, ~25 s antes (60 m a pé, 150 m de bicicleta).
3. **Radares fixos do OpenStreetMap (feito):**
   - nós `highway=speed_camera` e relações `type=enforcement` (`enforcement=maxspeed` ou
     `average_speed`) em Portugal, com limite (`maxspeed`) e direção quando existem;
   - extraídos **uma vez por mês** por um workflow do GitHub Actions (`speed-cameras.yml`), com
     um User-Agent próprio e uma só consulta; se o Overpass falhar (por exemplo, 429), o workflow
     termina com erro, o ficheiro anterior fica como está e tenta-se mais tarde. O resultado fica em
     `apps/web/public/data/speed-cameras.json` e a app nunca consulta o Overpass diretamente
     (as regras do servidor público pedem poucas consultas);
   - podem ser desligados nas definições ("Avisar radares fixos").
4. **Partilha entre pessoas (adiada):** fica para quando houver uma decisão sobre o servidor
   (por exemplo, um projeto gratuito do Supabase) e a revisão legal do ADR 0008.

## Limitações, licenças e termos

- **Lista oficial da ANSR (não usada):** a ANSR publica os locais do SINCRO em `radaresavista.pt`
  (mapa e PDF), mas os termos do site dizem que, salvo autorização prévia, expressa e escrita da
  ANSR, a informação não pode ser reutilizada. Por isso o Trajecto não usa essa lista.
- **OpenStreetMap (ODbL 1.0):** o ficheiro gerado é uma base de dados derivada e fica sob a ODbL.
  Leva a nota "© contribuidores do OpenStreetMap, ODbL 1.0" e a ligação para a licença; a app
  mostra a atribuição no menu "Sobre"; o ficheiro é público no próprio site (cumpre o §4.6 da
  ODbL). Não se pode misturar com dados de licença incompatível (como a lista da ANSR).
- **Cobertura:** o OSM pode não ter todos os radares, ou ter radares já desativados. Os radares
  do SINCRO rodam entre locais, por isso um local nem sempre está ativo. A interface diz isto.
- **Legalidade (só parcialmente confirmada):** o art. 84.º do Código da Estrada proíbe aparelhos
  que revelem a presença ou perturbem os instrumentos de fiscalização (detetores e
  inibidores). Fontes secundárias indicam que avisos de radares fixos conhecidos são permitidos e
  a ANSR tem uma parceria com o Waze, mas o texto oficial no Diário da República não foi lido
  daqui. **Antes de partilhar a app com outras pessoas é preciso confirmar.**
- **Reportes só neste dispositivo:** não são partilhados nem enviados para nenhum servidor;
  desaparecem se apagares os dados do browser. Servem sobretudo para testar o fluxo e para
  avisos pessoais (por exemplo, obras num caminho habitual).

## Consequências

Positivas:

- Avisos úteis já com um só utilizador, sem servidor e sem custos.
- Nenhum dado de reportes sai do telemóvel (RGPD: minimização).
- A lógica (`reports.ts`, `route-alerts.ts`, `speed-cameras.ts` no `core`) é testada sem browser.

Negativas:

- Sem partilha, os reportes de polícia, acidentes e trânsito só valem para quem os criou.
- Os radares dependem da qualidade do OpenStreetMap e são atualizados só uma vez por mês.
