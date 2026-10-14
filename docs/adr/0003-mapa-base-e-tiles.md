# ADR 0003: Mapa base e tiles

- **Estado:** Aceite (2026-10-14)
- **Data:** 2026-10-14

## Contexto

Precisamos de um mapa vetorial de Portugal, com modo claro e escuro, sem custos. Os mapas devem poder ser transferidos para uso offline na Fase 7.

## Decisão

1. **Fase 1:** usar os tiles públicos do **OpenFreeMap**, que seguem o esquema OpenMapTiles. O serviço é gratuito, não precisa de chave, não tem limites declarados e permite uso comercial, mas **não tem SLA**.
2. **Fase 2 ou seguinte:** gerar tiles próprios no computador local com **Planetiler 0.10.2** (Java 21+ ou Docker), a partir do extrato OSM de Portugal da Geofabrik. O resultado é um ficheiro **PMTiles**, lido no browser pela biblioteca `pmtiles` 4.5.0. Como o esquema é o mesmo, os estilos não mudam.
3. **Estilos:** estilos próprios, claro e escuro, para evitar dependência das licenças de estilos de terceiros.
4. **Atribuições sempre visíveis:** "© OpenStreetMap contributors" (ODbL) e "© OpenMapTiles" (CC-BY-4.0). No OpenFreeMap, também "OpenFreeMap".

## Consequências

Positivas:

- Custo zero.
- O mesmo ficheiro PMTiles serve para os mapas offline.

Negativas:

- Na Fase 1 dependemos de um serviço externo sem garantias.
- **Privacidade:** o OpenFreeMap recebe o teu endereço IP e as zonas do mapa que visualizas. Os PMTiles próprios eliminam esta exposição.
- Gerar os PMTiles exige alguns GB de disco e RAM. Os valores serão medidos e documentados.

## Alternativas consideradas

- **Martin 0.18.1** (tiles dinâmicos a partir do PostGIS): fica reservado para a camada de incidentes, se for útil.
- **Fornecedores comerciais de tiles:** rejeitados, porque custam dinheiro acima do plano gratuito e trazem termos restritivos.
