# Arquitetura do GeoMine

## Fluxo canônico

```text
src/index.template.html + manifesto + módulos + core
                         │
                         ▼
             build/GeoMine_base_modular.html
                         │
              overlay GeoMine + Cava v10.6
                         │
                         ▼
                 dist/GeoMine.html
```

Todo insumo dessa sequência está dentro deste projeto. A pasta `build/` é
intermediária e não deve ser distribuída como aplicativo GeoMine.

## Limites atuais

- O `core` está em 28 arquivos por domínio, mas é concatenado num mesmo
  `<script>` para preservar o comportamento histórico.
- A ordem de `src/module-order.json` ainda é parte do contrato.
- A Cava v10.6 fica isolada num `iframe` e conversa com o programa principal
  por uma ponte explícita.
- `src/build-overlays/geomine/` contém transformações reproduzíveis que serão
  absorvidas gradualmente pelos módulos definitivos.

## Regra para novos recursos

1. Criar ou alterar a fonte dentro de `src/`.
2. Expor somente o contrato necessário sob um namespace do GeoMine.
3. Acrescentar teste direto do contrato e teste integrado.
4. Montar com `tools/build_geomine.mjs`.
5. Nunca alterar `dist/GeoMine.html` diretamente.

## Próximas extrações

1. exportadores e codecs SHP/DBF/DXF;
2. CRS e reprojeção;
3. estado e eventos de camadas;
4. edição, seleção e análise espacial;
5. Layout e visualização 3D.
