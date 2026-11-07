# Notas da migração inicial

## Resultado verificado

- 53 blocos JavaScript extraídos.
- 15 blocos CSS extraídos.
- núcleo histórico dividido em 28 fragmentos de domínio.
- montagem final idêntica à referência original:
  `3f128bf982c8676b7c6fbf765765c065f41021de36b9bc99de0f2ba81a8907d9`.
- inicialização e troca para a aba **Meio Ambiente** validadas no navegador,
  sem a faixa de erro do próprio aplicativo.

## Riscos preexistentes observados

1. O navegador avisa que há mais de uma instância de Three.js. A fonte contém
   duas cópias incorporadas; a deduplicação deve ser feita numa etapa própria,
   com teste das vistas 3D e dos produtos de mineração.
2. O CSS do Leaflet solicita `images/layers-2x.png`, que não faz parte do HTML
   único. O controle principal usa interface própria, mas esse ativo deve ser
   incorporado como `data:` ou removido quando tratarmos as dependências.
3. A ordem do manifesto ainda é um contrato de compatibilidade porque os
   scripts compartilham símbolos globais e alguns blocos corrigem funções de
   blocos anteriores.

## Maiores unidades que ainda merecem subdivisão

- projeto de cava: aproximadamente 10 mil linhas;
- geoprocessamento/TIN: aproximadamente 5,5 mil linhas;
- drenagem e bacia: aproximadamente 4 mil linhas;
- hidrologia e inundação: aproximadamente 3,5 mil linhas;
- ribbon e preferências: aproximadamente 3,4 mil linhas;
- LiDAR e extensões de layout: aproximadamente 3 mil linhas.

Essas divisões devem continuar usando concatenação exata até seus contratos e
testes de caracterização existirem.

## Próxima etapa recomendada

Começar pelos domínios mais determinísticos: CRS/reprojeção e leitura/escrita
SHP/DBF. Eles têm entradas e saídas claras, podem receber testes unitários sem
mapa ou interface e servirão como padrão para os demais contratos.
