# Nomenclatura e símbolos de Geologia

O módulo `structural-standards.js` centraliza descrições dos 19 itens de
Geologia, títulos dos atributos e símbolos de atitude. Não altera nomes
personalizados de camadas, identificadores de comandos nem campos salvos.

## Terminologia

- Acamamento, foliação e xistosidade: direção do plano (**strike**) e
  mergulho (**dip**). A ficha distingue strike pela regra da mão direita
  de direção do mergulho (**dip direction**) e faz a conversão.
- Lineação e eixo de dobra: direção/azimute (**trend**) e caimento
  (**plunge**); não recebem a conversão de 90° dos planos.
- O comando antes denominado “Plunging” passa a **Eixo de Dobra**.
- O comando de linha passa a **Traço Axial de Dobra**, distinto da medida
  pontual da atitude do eixo.
- “Gnaissificação” na galeria passa a **Bandamento gnáissico**. Seu desenho
  legado continua identificado como convenção local, não como glifo normativo.

## Símbolos conferidos

Desenhos SVG próprios baseados nas pranchas finais do padrão cartográfico
**FGDC-STD-013-2006**, com cores e tamanhos configuráveis:

| Família | Horizontal | Inclinada | Vertical |
| --- | --- | --- | --- |
| Acamamento | 6.1 | 6.2 | 6.3 |
| Foliação de origem não especificada | 8.1.1 | 8.1.2 | 8.1.3 |
| Foliação metamórfica/tectônica, xistosidade | 8.3.1 | 8.3.2 | 8.3.3 |
| Clivagem genérica | 7.1 | 7.2 | 7.3 |
| Junta | 4.3.1 | 4.3.2 | 4.3.3 |
| Lineação genérica | 9.5 | 9.3 | 9.7 |
| Lineação de estiramento | 9.51 | 9.49 | 9.7 (linear genérico) |
| Eixo de dobra | 9.99 | 9.97 | 9.7 (linear genérico) |

O símbolo de acamamento invertido 6.4 é uma escolha explícita: o programa
nunca deduz inversão estratigráfica pelo ângulo. O símbolo vertical genérico
não pretende codificar uma variedade de dobra ou de lineação de estiramento.

Os ângulos 0°, entre 0° e 90°, e 90° selecionam a variante correspondente
ao desenhar. Medidas ausentes ou inválidas de camadas geológicas usam marcador
neutro; não inventam orientação norte. O ponto observado é o centro da linha
de strike para planos, a cauda da seta para estruturas lineares inclinadas e
o centro do símbolo para lineações horizontais/verticais. Mapa e Layout usam
o mesmo resolvedor e os mesmos desenhos.

Novas camadas de foliação usam o símbolo genérico, sem inferir origem
metamórfica. Camadas antigas que já utilizam `sd_fol` preservam esse ID,
correspondente à foliação metamórfica/tectônica. Símbolos personalizados não
são substituídos. Os campos persistidos conservam seus nomes originais;
somente as legendas dos controles apresentam a nomenclatura explicativa.

Nem todo marcador de localização ou estilo de traçado é um símbolo FGDC.
Somente os desenhos conferidos entram no grupo **Estruturais · FGDC/USGS**;
aproximações legadas são identificadas como **Geologia · convenções locais**.
Falhas, contatos, veios e zonas de cisalhamento mantêm tipo, confiança e
cinemática como atributos explícitos. Cores, hachuras e traçados genéricos
não comprovam litologia, movimento, idade ou continuidade do corpo.

## Fontes

- [SGB — simbologia geológica](https://geosgb.sgb.gov.br/geosgb/symbology.html)
  como referência de nomenclatura brasileira. Não foram copiados os arquivos
  de fonte/glifos do pacote SGB.
- [FGDC/USGS — padrão final](https://ngmdb.usgs.gov/fgdc_gds/geolsymstd.php),
  apêndice A: [juntas](https://ngmdb.usgs.gov/fgdc_gds/geolsymstd/fgdc-geolsym-sec04.pdf),
  [acamamento](https://ngmdb.usgs.gov/fgdc_gds/geolsymstd/fgdc-geolsym-sec06.pdf),
  [clivagem](https://ngmdb.usgs.gov/fgdc_gds/geolsymstd/fgdc-geolsym-sec07.pdf),
  [foliação](https://ngmdb.usgs.gov/fgdc_gds/geolsymstd/fgdc-geolsym-sec08.pdf) e
  [lineação/eixos](https://ngmdb.usgs.gov/fgdc_gds/geolsymstd/fgdc-geolsym-sec09.pdf).

## Validação

`tools/validate_structural_standards.mjs`: famílias, ângulos inválidos,
conversão RHR, mapeamento de campos e preservação de dados legados.

`tools/smoke_structural_standards.cjs`: interface real em navegador isolado,
ficha e propriedades, símbolos no mapa, SVG do Layout e salvar/reabrir.

As setas terminais de linhas são independentes da simbologia de atitudes;
ver `docs/line-arrows.md`.
