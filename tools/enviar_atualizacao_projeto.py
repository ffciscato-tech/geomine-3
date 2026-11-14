#!/usr/bin/env python3
"""Entrega um projeto GeoMine alterado ao dono, pelo banco do próprio GeoMine.

Quem altera um projeto por fora do GeoMine (por exemplo o Claude, a pedido da
pessoa) grava aqui a versão nova. O GeoMine aberto com a conta do dono confere
o banco ao carregar a página e a cada minuto, e carrega a versão nova sem
depender do Google Drive nem do seletor de arquivos
(src/modules/persistence/project-updates.js).

    python3 -I -X utf8 tools/enviar_atualizacao_projeto.py --credencial CHAVE.json \\
        --projeto Projeto_alterado.ccmgis --email dono@ccmeng.net \\
        --nota "Camadas A e B mescladas" [--live]

Sem --live nada é gravado: mostra só o que seria enviado.
--remover apaga a atualização guardada para aquele projeto e aquela conta.

Regras:
- o arquivo precisa manter o projectId do projeto que a pessoa tem aberto;
- só o dono (a conta do e-mail informado) consegue ler a atualização;
- cada envio substitui o anterior do mesmo projeto e da mesma conta;
- o e-mail nunca deve ser gravado no repositório, em relatórios ou em logs.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publicar_firebase as base  # noqa: E402  (mesmo autenticador da publicação do site)

PROJETO = "geomine-3"
APPS = ("ALAGIS", "CCMGIS", "CCMGeoCampo")
PARTE = 700_000          # bytes por documento (o limite do Firestore é 1 MiB)
MAX_PARTES = 80          # igual ao limite aceito pelo GeoMine
ENTRADA = "projeto.ccmgis"


class Banco:
    def __init__(self, token: str, emulador: str | None):
        self.token = token
        raiz = emulador.rstrip("/") if emulador else "https://firestore.googleapis.com"
        projeto = "demo-geomine" if emulador else PROJETO
        self.docs = f"{raiz}/v1/projects/{projeto}/databases/(default)/documents"

    def chamar(self, metodo: str, caminho: str, corpo=None, falta_ok: bool = False):
        dados = json.dumps(corpo).encode() if corpo is not None else None
        cabecalhos = {"Authorization": f"Bearer {self.token}"}
        if dados is not None:
            cabecalhos["Content-Type"] = "application/json"
        pedido = urllib.request.Request(self.docs + caminho, data=dados, method=metodo, headers=cabecalhos)
        try:
            with urllib.request.urlopen(pedido, timeout=180) as resposta:
                texto = resposta.read()
        except urllib.error.HTTPError as erro:
            if falta_ok and erro.code == 404:
                return None
            raise SystemExit(f"Falha em {metodo} {caminho.split('?')[0]}: HTTP {erro.code}\n"
                             f"{erro.read().decode('utf-8', 'replace')[:600]}")
        return json.loads(texto) if texto.strip() else {}

    def partes(self, ident: str) -> list[dict]:
        saida, pagina = [], ""
        while True:
            consulta = "?pageSize=200&mask.fieldPaths=revision" + (f"&pageToken={urllib.parse.quote(pagina)}" if pagina else "")
            r = self.chamar("GET", f"/projectUpdates/{ident}/parts{consulta}") or {}
            saida += r.get("documents", [])
            pagina = r.get("nextPageToken", "")
            if not pagina:
                return saida


def campo(valor) -> dict:
    if isinstance(valor, bool):
        return {"booleanValue": valor}
    if isinstance(valor, int):
        return {"integerValue": str(valor)}
    if isinstance(valor, bytes):
        return {"bytesValue": base64.b64encode(valor).decode()}
    return {"stringValue": str(valor)}


def identificador(email: str, project_id: str) -> str:
    return hashlib.sha256((email + "\n" + project_id).encode("utf-8")).hexdigest()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--credencial")
    p.add_argument("--projeto", help="arquivo .ccmgis alterado")
    p.add_argument("--project-id", help="com --remover, o projectId do projeto")
    p.add_argument("--email", required=True, help="conta @ccmeng.net do dono (não gravar em logs)")
    p.add_argument("--nota", default="", help="o que foi alterado, em uma frase; aparece para a pessoa")
    p.add_argument("--remover", action="store_true", help="apaga a atualização guardada")
    p.add_argument("--live", action="store_true", help="grava de verdade")
    p.add_argument("--emulador", help="URL do emulador do Firestore, para testes (ex.: http://127.0.0.1:8085)")
    a = p.parse_args()

    email = a.email.strip().lower()
    if not email.endswith("@ccmeng.net") or " " in email or email.count("@") != 1:
        raise SystemExit("O e-mail precisa ser uma conta @ccmeng.net.")

    bruto = dados = None
    if a.remover:
        project_id = a.project_id
        if not project_id and a.projeto:
            project_id = json.loads(Path(a.projeto).read_text(encoding="utf-8")).get("projectId")
        if not project_id:
            raise SystemExit("Informe --project-id ou --projeto para remover.")
    else:
        if not a.projeto:
            raise SystemExit("Informe --projeto.")
        bruto = Path(a.projeto).read_bytes()
        try:
            dados = json.loads(bruto.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as erro:
            raise SystemExit(f"O arquivo não é um projeto GeoMine em JSON: {erro}")
        if not isinstance(dados, dict) or dados.get("app") not in APPS:
            raise SystemExit("O arquivo não é um projeto GeoMine (campo app ausente ou desconhecido).")
        project_id = dados.get("projectId")
        if not isinstance(project_id, str) or not project_id or len(project_id) > 200:
            raise SystemExit("O projeto não tem projectId: o GeoMine não saberia a que projeto aberto ele corresponde.")
        if not a.nota.strip():
            raise SystemExit("Informe --nota com o que foi alterado; é o texto que a pessoa lê antes de carregar.")

    ident = identificador(email, project_id)
    if a.emulador:
        banco = Banco("owner", a.emulador)
    elif a.live:
        banco = Banco(base.emitir_token(base.carregar_chave(a.credencial)), None)
    else:
        banco = None

    if a.remover:
        if banco is None:
            print(f"Simulação: apagaria a atualização {ident[:12]}… do projeto {project_id}. Repita com --live.")
            return
        antigas = banco.partes(ident)
        for doc in antigas:
            banco.chamar("DELETE", "/" + doc["name"].split("/documents/", 1)[1])
        banco.chamar("DELETE", f"/projectUpdates/{ident}")
        print(f"Atualização removida ({len(antigas)} partes).")
        return

    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as pacote:
        pacote.writestr(ENTRADA, bruto)
    compactado = memoria.getvalue()
    pedacos = [compactado[i:i + PARTE] for i in range(0, len(compactado), PARTE)]
    if len(pedacos) > MAX_PARTES:
        raise SystemExit(f"O projeto compactado tem {len(compactado) / 1048576:.1f} MB; o limite é "
                         f"{MAX_PARTES * PARTE / 1048576:.0f} MB.")
    agora = int(time.time() * 1000)
    revisao = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + secrets.token_hex(4)
    resumo = hashlib.sha256(bruto).hexdigest()
    camadas = len(dados.get("layers") or [])
    print(f"Projeto {project_id} · {camadas} camadas · {len(bruto) / 1024:.0f} KB "
          f"({len(compactado) / 1024:.0f} KB compactado, {len(pedacos)} parte(s)) · revisão {revisao}")
    if banco is None:
        print("Simulação: nada foi gravado. Repita com --live para entregar.")
        return

    for n, pedaco in enumerate(pedacos):
        banco.chamar("PATCH", f"/projectUpdates/{ident}/parts/{revisao}_{n}",
                     {"fields": {"revision": campo(revisao), "n": campo(n), "data": campo(pedaco)}})
    banco.chamar("PATCH", f"/projectUpdates/{ident}", {"fields": {
        "emailLower": campo(email), "projectId": campo(project_id), "revision": campo(revisao), "at": campo(agora),
        "name": campo(Path(a.projeto).name), "note": campo(a.nota.strip()[:400]), "parts": campo(len(pedacos)),
        "bytes": campo(len(compactado)), "rawBytes": campo(len(bruto)), "sha256": campo(resumo),
        "format": campo("zip"), "entry": campo(ENTRADA)}})

    # Confere o que ficou gravado, lendo de volta como o GeoMine lê.
    cabeca = banco.chamar("GET", f"/projectUpdates/{ident}")["fields"]
    if cabeca["revision"]["stringValue"] != revisao:
        raise SystemExit("Outra gravação entrou no meio; envie de novo.")
    lido = b""
    for n in range(len(pedacos)):
        parte = banco.chamar("GET", f"/projectUpdates/{ident}/parts/{revisao}_{n}")
        lido += base64.b64decode(parte["fields"]["data"]["bytesValue"])
    with zipfile.ZipFile(io.BytesIO(lido)) as pacote:
        if hashlib.sha256(pacote.read(ENTRADA)).hexdigest() != resumo:
            raise SystemExit("O conteúdo gravado não confere com o arquivo enviado.")

    removidas = 0
    for doc in banco.partes(ident):
        if doc.get("fields", {}).get("revision", {}).get("stringValue") != revisao:
            banco.chamar("DELETE", "/" + doc["name"].split("/documents/", 1)[1])
            removidas += 1
    print(f"Entregue e conferido ({time.strftime('%d/%m/%Y %Hh%M', time.localtime(agora / 1000))} do servidor)."
          + (f" {removidas} parte(s) da revisão anterior removidas." if removidas else ""))
    print("O GeoMine carrega a versão nova ao atualizar a página (ou em até um minuto com a aba aberta).")


if __name__ == "__main__":
    main()
