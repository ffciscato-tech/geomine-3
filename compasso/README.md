# Compasso — controle de horas da CCM

Cópia de referência do **Compasso | Meu tempo de projeto**, versão 2.2, o
apontador de horas pessoal da CCM Engenharia. O aplicativo foi gerado no
ChatGPT e está publicado em
`https://compasso-horas-ccm.servidor185802.chatgpt.site`. Esta pasta guarda
o código exatamente como o site servia em 22/11/2026 (sem o script de
telemetria que a Cloudflare injeta na página), para que ele não dependa só da
hospedagem do ChatGPT.

## Arquivos

| Caminho | Conteúdo |
|---|---|
| `index.html` | O aplicativo inteiro: estilos, marcação e o script do apontador |
| `team.js` | Aba "Equipe CCM": lê a presença da equipe no Firestore do projeto `projetosccm` com login Google (a chave é a chave pública de cliente do Firebase, como `web/firebase-config.json`) |
| `assets/logos/*.png` | Logos dos clientes usadas nos cartões de projeto |
| `restaurar-morro-verde-drenagem.json` | Arquivo de restauração para importar no Compasso (ver abaixo) |

Para rodar localmente basta servir a pasta por HTTP (`python3 -m http.server`)
e abrir `index.html`. Abrir o arquivo direto no navegador também funciona para
o apontador, mas a aba Equipe exige HTTPS e domínio autorizado no Firebase.

## Onde ficam os dados

**Os dados ficam só no navegador.** O Compasso grava tudo em
`localStorage`, na chave `compasso-ccm-v1`, como um JSON com `projects`,
`entries` (lançamentos) e `active` (sessão em andamento). Não há servidor, nem
sincronização, nem cópia em nuvem. A aba "Exportar e backup" gera:

- `Compasso_backup_AAAA-MM-DD.json`: cópia completa (projetos, lançamentos e
  sessão), que o botão "Importar backup" une aos dados atuais sem duplicar IDs;
- `Compasso_horas_AAAA-MM-DD.csv`: planilha para a prestação de contas no CCM.

Consequências:

- Cada navegador e cada aparelho tem a sua própria base. Um backup JSON é a
  única forma de levar as horas de um lugar para outro.
- Se a URL do aplicativo mudar (outro subdomínio do ChatGPT, por exemplo), a
  página nova abre vazia: o `localStorage` é por origem.
- O Safari do iPad e do iPhone apaga o armazenamento de sites que o usuário
  não abre por cerca de 7 dias, e qualquer "Limpar histórico e dados" também
  apaga tudo.
- Se o JSON gravado falhar na validação do aplicativo, ele mostra o aviso
  "Armazenamento indisponível ou dados inválidos" e bloqueia o apontador, mas
  não apaga o que está gravado.

## Incidente de 22/11/2026

As cerca de 35 horas lançadas no projeto **Morro Verde · 38_26 · Consolidação
da drenagem** (ID CCM `mubd2lo4h4xec`) sumiram do Compasso. Pelo que o código
mostra, não havia cópia em servidor, então o Compasso não tem de onde
recuperá-las sozinho. Para recuperar:

1. Procure um `Compasso_backup_*.json` ou `Compasso_horas_*.csv` salvo no
   aparelho ou no Drive e use "Importar backup".
2. Se as horas já tinham sido marcadas com "✓ CCM", elas devem estar no
   Projetos CCM (`https://projetosccm.web.app/`).
3. Sem backup, relance as horas pelo arquivo de restauração desta pasta
   (abaixo) ou por "＋ Lançar horas".

### Arquivo de restauração

`restaurar-morro-verde-drenagem.json` é um backup do Compasso só com o projeto
Morro Verde 38_26 e lançamentos de recuperação que somam 35 h, distribuídas
a pedido do usuário em terça 17, quarta 18, quinta 19 e sexta 20/11/2026
(8 h 45 min por dia, valor da hora R$ 90). Para importar, abra o Compasso, aba
"Exportar e backup", "Importar backup" e escolha o arquivo. O projeto é reconhecido pelo
ID CCM, então nada é duplicado; os lançamentos entram como "A transferir".

## Para o futuro

Para esta pasta valer como fonte, qualquer ajuste no Compasso deve ser feito
aqui e depois levado para a hospedagem, e não o contrário. Uma cópia de
segurança automática (por exemplo, gravar o JSON no Drive ao concluir cada
sessão, como o GeoMine faz com os projetos) evitaria perdas como esta.
