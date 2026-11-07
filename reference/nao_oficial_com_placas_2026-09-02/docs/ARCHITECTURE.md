# Arquitetura de transição

## Objetivo

Permitir que uma funcionalidade seja localizada, analisada e testada sem abrir
o HTML monolítico inteiro, mantendo como artefato final um único arquivo que
funcione offline.

## Camadas

1. **Vendor** — Leaflet, Proj4, JSZip, Three, GeoTIFF e demais bibliotecas.
2. **Core** — estado, projeções, mapa, camadas e contratos compartilhados.
3. **Módulos de domínio** — mineração, meio ambiente, fontes de dados, análise,
   raster, simbologia, layout, visualização e persistência.
4. **Orquestrador de montagem** — lê `src/module-order.json` e incorpora cada
   módulo na posição original, produzindo o HTML offline.

## Estado atual

Esta primeira etapa é estrutural e conservadora. Os blocos históricos foram
extraídos sem alterar seu conteúdo, portanto ainda existem dependências por
variáveis globais e correções que envolvem funções anteriores. O arquivo
O antigo `src/core/legacy-main.js` foi dividido em fragmentos de domínio dentro
de `src/core/parts/`. Durante esta fase eles são concatenados no mesmo bloco
`<script>` para manter o escopo global e a execução exatamente iguais. A cópia
não dividida permanece em `reference/legacy-main.unsplit.js`.

## Próximas fronteiras de extração

1. CRS e reprojeção.
2. SHP/DBF/PRJ e demais importadores/exportadores.
3. Estado e eventos de camadas.
4. Raster/MDE.
5. Desenho, edição e análise espacial.
6. Layout e visualização 3D.

Cada extração deve preservar a interface pública existente até que todos os
consumidores do domínio tenham migrado para um contrato explícito.
