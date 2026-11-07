# Caixa de retenção: berma na boca

O painel **Gerar Caixa** (Hidrologia › Caixa de retenção) ganhou o campo
**Berma na boca (m)** (`bcBermBoca`, padrão 0). É uma faixa horizontal, na cota
da aresta, entre a aresta da caixa e o pé do talude de corte. O corte só começa
a subir depois dela. Com 0 o comportamento é o anterior: o corte nasce na aresta.

## Implementação

- `baciaBermaBoca(p)` lê a largura; `baciaCorteHEmDist` mede a altura do corte
  a partir da borda externa da berma. Ambas em `core/parts/28-drainage-and-basin.js`.
- A mesma regra entra em `baciaCotaEng` (superfície de projeto usada por
  `tinSurfaceZ`, TIN, volume e interseção completa com o MDT) e em
  `baciaDaylight` (marcha do encontro com o terreno).
- A malha exata ganha um vértice na borda da berma; as quebras do encontro e as
  bermas externas escalonadas são deslocadas pela largura da berma.
- A borda externa vira feição real, `TIPO = 'Berma da boca — borda externa'`, na
  cota da aresta; por conter "Berma", é recortada no MDT junto com as demais quebras.
- O valor é persistido em `tinSurface.p.bermBoca` e aparece na saída do painel,
  na figura e no memorial.

## Verificação (07/10/2026)

Projeto real Ísis (MDT de 0,6 m), aresta 26 × 13 m, P = 2,65 m:

- Perfil da superfície de projeto a partir da aresta, berma 1 m: cota da aresta
  de 0 a 1,0 m; em 1,5 m sobe 0,5 m a 45° e 1,072 m a 65°, como esperado.
- Regressão com berma 0: encontro com o terreno de 459,6 m² (65°) e 618,5 m²
  (45°), iguais aos obtidos antes da mudança. Com berma 1 m: 542,3 e 711,7 m².
- Reabertura do `.ccmgis` gravado, sem erros de página.

Não há teste automatizado da caixa em `tools/`; a verificação foi feita em
Chrome headless sobre o `dist/GeoMine.html`.
