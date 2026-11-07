# Vários rasters na seção geológica

Em **Geologia → Seção Geológica**, escolha um **Terreno de referência / MDT** e marque quantos **Rasters adicionais** forem necessários. Cada fonte pode representar superfície, nível d’água ou contato geológico. Esses papéis organizam nomes e estilos; não inferem litologia nem volumes.

Para cada raster adicional escolha o significado dos valores:

- **Cotas absolutas (m):** usa diretamente a elevação do raster.
- **Profundidade abaixo do terreno (m):** subtrai a profundidade positiva da cota do MDT na mesma estação. Sem terreno válido, a estação fica vazia.

Use valores em metros e a mesma referência altimétrica. A reprojeção horizontal não converte datum vertical. Ortofotos RGB não fornecem elevação. O perfil usa a grade disponível no projeto (incluindo `_full`, quando disponível); selecionar a fonte não garante acesso ao TIFF original desconectado. O passo controla a amostragem, limitado a 20.001 estações por seção; o resumo informa o passo efetivo. Feições menores que esse passo podem não ser amostradas.

Após gerar, **Editar linhas da seção** permite alterar nome, visibilidade, cor, espessura e traçado. Inclui terreno, rasters adicionais, cortes de malhas e projetos de cava. As alterações atualizam imediatamente o desenho e sua exportação PNG. Ocultar a linha do terreno não remove sua função de referência para geologia, furos e conversão de profundidades.

**Salvar no projeto** guarda fontes e estilos na camada do eixo, usando os atributos `RAST_PERF` e `LIN_EST`. Depois salve o arquivo do projeto pelo fluxo clássico. Seções diferentes mantêm estilos independentes; novas seções podem herdar as opções atuais. Não há alteração automática das camadas de origem nem dos estilos do Perfil Longitudinal.

Fontes são identificadas por ID, não pelo nome. Fontes ausentes não são substituídas; aparecem com aviso. Valores NoData encontrados na amostragem deixam lacunas, sem unir trechos separados. Rasters de cota absoluta podem gerar perfil sem MDT; rasters de profundidade, sozinhos, não fabricam terreno.

Implementação: módulo independente `section-raster-profiles.js`, com integração no módulo de seções. A grade de cada fonte é amostrada respeitando CRS horizontal, tamanho X/Y de célula, recorte e NoData. A escala horizontal e vertical permanece 1:1.
