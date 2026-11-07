# Checkpoint — v10.6

Arquivo: `cava_pilha_v106_CHECKPOINT.html`. Sucede o checkpoint v9.3, e é construído
sobre ele. Sintaxe conferida e suíte verde.

## O que ganhou em relação ao v9.3

| correção | evidência |
|---|---|
| **pista com a largura exata** — a paralela ganhou junta miter | mín = p50 = p95 = nominal em 4 configurações (10.00 / 20.00 / 15.00 / 20.00), 0 de 1.680 amostras abaixo de 95%. Antes: 9,94 m típicos e 8,30 m no pior caso |
| **aresta de partida herdada** dividida pelo cosseno | pior caso subiu de 4,84 para 8,79 m numa junta de 70° |
| **cota do bloco encadeado aplicada uma vez só** | contorno da `CAVA#1` ia a −420 m com anéis em −180/−240; agora coincidem |
| **contorno da rampa pelas bordas pareadas** + camada `_RAMPA_SECOES` | o contorno pintado passava por aparagem e dava saltos no 3D |
| **nome do arquivo exportado com a versão real** | era fixo em "v48" |

## O que este build NÃO tem (e o v9.3 também não)

- `corrigeFace` — a correção do ângulo de face perto do portal da rampa (linha v10.0–v10.3).
  Sem ela a face fecha até ~47,8° onde o projeto pede 45°.
- O contorno da crista em volta da boca continua como no v9.3: presente, invisível, e capaz
  de gerar laço quando o R cai perto de um vértice.

## Voltar a partir daqui

```bash
cp ~/Documents/code/cava-pilha/cava_pilha_v106_CHECKPOINT.html ~/Documents/code/cava-pilha/cava_pilha_v107.html
```
