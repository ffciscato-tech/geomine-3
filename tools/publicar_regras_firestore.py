#!/usr/bin/env python3
"""Publica as regras do Firestore (firestore.rules) do projeto geomine-3.

Sem --live, só compara o arquivo com o que está em produção (nada muda).
Com --live, publica o conjunto novo e mostra o conjunto anterior, para poder
voltar com --voltar <id>. O Firebase recusa regras que não compilam.

ANTES de publicar, teste as regras no emulador local (a conta de serviço não
tem permissão para o testador da API):

    firebase emulators:start --only firestore --project demo-geomine
    python3 -I -X utf8 tools/enviar_atualizacao_projeto.py --emulador http://127.0.0.1:8085 ...
    node validation/regras-firestore-atualizacoes.emulador.cjs

    python3 -I -X utf8 tools/publicar_regras_firestore.py --credencial CHAVE.json
    python3 -I -X utf8 tools/publicar_regras_firestore.py --credencial CHAVE.json --live
    python3 -I -X utf8 tools/publicar_regras_firestore.py --credencial CHAVE.json --voltar ID --live

A publicação é recusada se as regras em produção não forem as do commit
anterior deste arquivo (alguém mudou por fora): confira antes de sobrescrever.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publicar_firebase as base  # noqa: E402  (mesmo autenticador da publicação do site)

PROJETO = "geomine-3"
API = "https://firebaserules.googleapis.com/v1"
RELEASE = f"projects/{PROJETO}/releases/cloud.firestore"


def chamar(token: str, metodo: str, url: str, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    cabecalhos = {"Authorization": f"Bearer {token}"}
    if dados is not None:
        cabecalhos["Content-Type"] = "application/json"
    pedido = urllib.request.Request(url, data=dados, method=metodo, headers=cabecalhos)
    try:
        with urllib.request.urlopen(pedido, timeout=120) as resposta:
            texto = resposta.read()
    except urllib.error.HTTPError as erro:
        raise SystemExit(f"Falha em {metodo} {url}: HTTP {erro.code}\n{erro.read().decode('utf-8', 'replace')[:800]}")
    return json.loads(texto) if texto.strip() else {}


def fonte_publicada(token: str) -> tuple[str, str]:
    atual = chamar(token, "GET", f"{API}/{RELEASE}")
    conjunto = chamar(token, "GET", f"{API}/{atual['rulesetName']}")
    return atual["rulesetName"], conjunto["source"]["files"][0]["content"]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--credencial")
    p.add_argument("--live", action="store_true", help="publica em produção")
    p.add_argument("--voltar", metavar="ID", help="aponta a produção para um conjunto de regras anterior")
    a = p.parse_args()
    raiz = Path(__file__).resolve().parent.parent
    token = base.emitir_token(base.carregar_chave(a.credencial))
    nome_atual, publicada = fonte_publicada(token)
    print(f"Em produção: {nome_atual}")

    if a.voltar:
        alvo = f"projects/{PROJETO}/rulesets/{a.voltar.split('/')[-1]}"
        chamar(token, "GET", f"{API}/{alvo}")
        if not a.live:
            print(f"Simulação: a produção passaria a usar {alvo}. Repita com --live.")
            return
        chamar(token, "PATCH", f"{API}/{RELEASE}", {"release": {"name": RELEASE, "rulesetName": alvo}})
        print(f"Produção agora usa {alvo}.")
        return

    fonte = (raiz / "firestore.rules").read_text(encoding="utf-8")
    if fonte == publicada:
        print("As regras em produção já são as deste repositório.")
        return
    anterior = subprocess.run(["git", "show", "HEAD:firestore.rules"], cwd=raiz, capture_output=True, text=True)
    conhecidas = {fonte}
    if anterior.returncode == 0:
        conhecidas.add(anterior.stdout)
    historico = subprocess.run(["git", "log", "--format=%H", "-n", "6", "--", "firestore.rules"],
                               cwd=raiz, capture_output=True, text=True).stdout.split()
    for commit in historico:
        for ref in (commit, commit + "^"):
            antigo = subprocess.run(["git", "show", f"{ref}:firestore.rules"], cwd=raiz, capture_output=True, text=True)
            if antigo.returncode == 0:
                conhecidas.add(antigo.stdout)
    if publicada not in conhecidas:
        raise SystemExit("As regras em produção não correspondem a nenhuma versão recente de firestore.rules "
                         "neste repositório. Pare e confira antes de sobrescrever.")
    if not a.live:
        print("Simulação concluída: as regras deste repositório diferem das de produção. Repita com --live para publicar.")
        return
    novo = chamar(token, "POST", f"{API}/projects/{PROJETO}/rulesets",
                  {"source": {"files": [{"name": "firestore.rules", "content": fonte}]}})
    chamar(token, "PATCH", f"{API}/{RELEASE}", {"release": {"name": RELEASE, "rulesetName": novo["name"]}})
    conferido, agora = fonte_publicada(token)
    if conferido != novo["name"] or agora != fonte:
        raise SystemExit("A produção não ficou com as regras enviadas. Confira no console do Firebase.")
    print(f"Publicado: {novo['name']}")
    print(f"Para voltar: --voltar {nome_atual.split('/')[-1]} --live")


if __name__ == "__main__":
    main()
