# Primeira visualização da ortofoto — 28/09/2026

O módulo `modules/raster/orthophoto-first-frame.js` apresenta os blocos RGB
já decodificados enquanto a prévia definitiva é preparada. A imagem temporária
tem até 640 px no lado maior e usa a mesma reprojeção Web Mercator da ortofoto.
É removida no sucesso, erro ou cancelamento; não é salva no projeto. A prévia
definitiva mantém sua dimensão, pixels e referências ao TIFF original. O
primeiro enquadramento ocorre quando há pixels válidos, não nos blocos vazios.

No importador comum, o cabeçalho identifica RGB antes da preparação da fonte.
Para RGB de pelo menos 64 MiB, a leitura inicial usa intervalos do original.
No Android, a cópia estável para OPFS (64 MiB até menos de 1 GiB) passa a ocorrer
depois da criação da ortofoto definitiva. Quando pronta, substitui apenas a
fonte de bytes do leitor, preservando índices e caches. Falha nessa cópia não
remove a imagem; avisa para manter o original acessível. Trocar de projeto
cancela a cópia. A política anterior permanece para MDTs e arquivos menores.

O callback de blocos é opcional e apenas observa as bandas já lidas: não muda
a interpolação nem gera leituras adicionais. Atualizações da imagem temporária
são limitadas a uma a cada 750 ms após a primeira. O mecanismo por faixas é
preservado para formatos não atendidos pelo leitor direto de blocos.

## Validação

- Testes de prévia, alfa, NoData, cancelamento, mudança de projeto, faixas e cópia
  em segundo plano: `tools/validate_ortho_first_frame.mjs`.
- Leitor por intervalos: 15 verificações, inclusive adoção da cópia estável.
- Abertura rápida: 14 verificações; cache de fonte: 26 verificações.
- Ortomosaico real local de 77.930.425 bytes, 22.010 × 36.133 pixels e oito níveis:
  importação, blocos vazios, pixels nativos e pixel nativo do Layout conferidos.
  Teste Android é emulação de identificação/toque no Chrome de desktop, não
  medição de desempenho em tablet físico nem do provedor Google Drive.

O tamanho comprimido do TIFF não determina sozinho a demora. Se o provedor do
Drive baixar o arquivo inteiro antes de liberar a primeira leitura, este patch
não elimina essa espera externa. Não modifica login, regras, salvamento,
resolução original ou relocalização do arquivo em projetos já abertos.
