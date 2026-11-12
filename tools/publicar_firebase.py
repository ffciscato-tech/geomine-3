"""Publica a pasta public/ no Firebase Hosting pela API REST, sem o Firebase CLI.

Uso:
    python3 -I -X utf8 tools/publicar_firebase.py --canal previa-teste   # canal de prévia temporário
    python3 -I -X utf8 tools/publicar_firebase.py --live                 # site no ar

Credencial: chave JSON de uma conta de serviço do projeto, informada por
--credencial CAMINHO, pela variável GOOGLE_APPLICATION_CREDENTIALS (caminho) ou
pela variável FIREBASE_SERVICE_ACCOUNT (conteúdo do JSON). A chave nunca é
impressa nem gravada. Requer apenas a biblioteca padrão e o comando openssl.

O script lê firebase.json (pasta pública, cabeçalhos, cleanUrls) e .firebaserc
(projeto padrão). Ele não monta o aplicativo: rode antes tools/build.py e
tools/preparar_hosting.py.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://firebasehosting.googleapis.com/v1beta1"
ESCOPOS = "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase"


def carregar_chave(caminho: str | None) -> dict:
    if caminho:
        return json.loads(Path(caminho).read_text(encoding="utf-8"))
    if os.environ.get("FIREBASE_SERVICE_ACCOUNT"):
        return json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return json.loads(Path(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]).read_text(encoding="utf-8"))
    raise SystemExit("Credencial ausente: use --credencial, GOOGLE_APPLICATION_CREDENTIALS ou FIREBASE_SERVICE_ACCOUNT.")


def emitir_token(chave: dict) -> str:
    def b64(dados: bytes) -> bytes:
        return base64.urlsafe_b64encode(dados).rstrip(b"=")

    agora = int(time.time())
    cabecalho = b64(json.dumps({"alg": "RS256", "typ": "JWT", "kid": chave["private_key_id"]}).encode())
    corpo = b64(json.dumps({
        "iss": chave["client_email"], "scope": ESCOPOS, "aud": chave["token_uri"],
        "iat": agora, "exp": agora + 3000,
    }).encode())
    with tempfile.NamedTemporaryFile("w", delete=False) as arquivo:
        arquivo.write(chave["private_key"])
        pem = arquivo.name
    try:
        os.chmod(pem, 0o600)
        assinatura = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", pem],
            input=cabecalho + b"." + corpo, capture_output=True, check=True,
        ).stdout
    finally:
        os.remove(pem)
    pedido = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": (cabecalho + b"." + corpo + b"." + b64(assinatura)).decode(),
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(chave["token_uri"], data=pedido), timeout=60) as resposta:
        return json.load(resposta)["access_token"]


class Hosting:
    def __init__(self, token: str):
        self.token = token

    def chamar(self, metodo: str, url: str, corpo=None, binario: bytes | None = None):
        cabecalhos = {"Authorization": f"Bearer {self.token}"}
        dados = None
        if binario is not None:
            dados = binario
            cabecalhos["Content-Type"] = "application/octet-stream"
        elif corpo is not None:
            dados = json.dumps(corpo).encode()
            cabecalhos["Content-Type"] = "application/json"
        pedido = urllib.request.Request(url, data=dados, method=metodo, headers=cabecalhos)
        try:
            with urllib.request.urlopen(pedido, timeout=300) as resposta:
                texto = resposta.read()
        except urllib.error.HTTPError as erro:
            detalhe = erro.read().decode("utf-8", "replace")[:600]
            raise SystemExit(f"Falha em {metodo} {url.split('?')[0]}: HTTP {erro.code}\n{detalhe}")
        return json.loads(texto) if texto.strip() else {}


def configuracao_hosting(raiz: Path) -> tuple[Path, dict]:
    hosting = json.loads((raiz / "firebase.json").read_text(encoding="utf-8"))["hosting"]
    config: dict = {}
    if hosting.get("headers"):
        config["headers"] = [
            {"glob": regra["source"], "headers": {h["key"]: h["value"] for h in regra["headers"]}}
            for regra in hosting["headers"]
        ]
    if hosting.get("cleanUrls"):
        config["cleanUrls"] = True
    return raiz / hosting.get("public", "public"), config


def listar_arquivos(publica: Path) -> dict[str, Path]:
    arquivos = {}
    for caminho in sorted(publica.rglob("*")):
        relativo = caminho.relative_to(publica)
        if not caminho.is_file():
            continue
        # Mesmas exclusões do firebase.json: ocultos, node_modules e o próprio firebase.json.
        if any(parte.startswith(".") or parte == "node_modules" for parte in relativo.parts):
            continue
        if relativo.name == "firebase.json":
            continue
        arquivos["/" + relativo.as_posix()] = caminho
    if "/index.html" not in arquivos:
        raise SystemExit(f"{publica}/index.html não existe. Rode tools/build.py e tools/preparar_hosting.py antes.")
    return arquivos


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    destino = parser.add_mutually_exclusive_group(required=True)
    destino.add_argument("--live", action="store_true", help="publica no site no ar")
    destino.add_argument("--canal", help="publica num canal de prévia com este identificador")
    parser.add_argument("--expira", default="86400s", help="validade do canal de prévia (padrão: 86400s)")
    parser.add_argument("--credencial", help="caminho da chave JSON da conta de serviço")
    parser.add_argument("--mensagem", default="", help="mensagem registrada no release")
    parser.add_argument("--raiz", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    raiz = args.raiz.resolve()
    projeto = json.loads((raiz / ".firebaserc").read_text(encoding="utf-8"))["projects"]["default"]
    site = f"sites/{projeto}"
    publica, config = configuracao_hosting(raiz)
    arquivos = listar_arquivos(publica)

    comprimidos: dict[str, bytes] = {}
    hashes: dict[str, str] = {}
    for rota, caminho in arquivos.items():
        bruto = caminho.read_bytes()
        gz = gzip.compress(bruto, compresslevel=9, mtime=0)
        hashes[rota] = hashlib.sha256(gz).hexdigest()
        comprimidos[hashes[rota]] = gz
        print(f"  {rota}  {len(bruto)} bytes  sha256 {hashlib.sha256(bruto).hexdigest()}")

    hosting = Hosting(emitir_token(carregar_chave(args.credencial)))

    versao = hosting.chamar("POST", f"{API}/{site}/versions", {"config": config})["name"]
    print(f"Versão criada: {versao}")
    populado = hosting.chamar("POST", f"{API}/{versao}:populateFiles", {"files": hashes})
    for h in populado.get("uploadRequiredHashes", []):
        hosting.chamar("POST", f"{populado['uploadUrl']}/{h}", binario=comprimidos[h])
        print(f"  enviado {h[:16]}… ({len(comprimidos[h])} bytes comprimidos)")
    hosting.chamar("PATCH", f"{API}/{versao}?update_mask=status", {"status": "FINALIZED"})

    consulta = urllib.parse.urlencode({"versionName": versao})
    corpo = {"message": args.mensagem} if args.mensagem else {}
    if args.live:
        release = hosting.chamar("POST", f"{API}/{site}/releases?{consulta}", corpo)
        url = f"https://{projeto}.web.app/"
    else:
        canal = f"{site}/channels/{args.canal}"
        try:
            dados_canal = hosting.chamar("GET", f"{API}/{canal}")
        except SystemExit:
            dados_canal = hosting.chamar(
                "POST", f"{API}/{site}/channels?{urllib.parse.urlencode({'channelId': args.canal})}",
                {"ttl": args.expira},
            )
        release = hosting.chamar("POST", f"{API}/{canal}/releases?{consulta}", corpo)
        url = dados_canal["url"].rstrip("/") + "/"
    print(f"Release: {release['name']}  ({release.get('releaseTime')})")
    print(f"URL: {url}")

    # Conferência 1 (sempre): os arquivos registrados na versão têm os hashes enviados.
    registrados = {
        item["path"]: item.get("hash")
        for item in hosting.chamar("GET", f"{API}/{versao}/files?pageSize=1000").get("files", [])
    }
    divergentes = [rota for rota, h in hashes.items() if registrados.get(rota) != h]
    if divergentes:
        raise SystemExit(f"Arquivos divergentes na versão publicada: {divergentes}")
    print(f"Conferido na API: {len(hashes)} arquivos da versão têm os hashes enviados.")

    # Conferência 2 (quando a rede permite): o HTML servido é exatamente o index.html local.
    esperado = hashlib.sha256(arquivos["/index.html"].read_bytes()).hexdigest()
    servido = ""
    try:
        for _ in range(6):
            pedido = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(pedido, timeout=300) as resposta:
                servido = hashlib.sha256(resposta.read()).hexdigest()
            if servido == esperado:
                break
            time.sleep(5)
    except urllib.error.URLError as erro:
        print(f"Aviso: não foi possível baixar {url} deste ambiente ({erro.reason}). Confira pelo navegador.")
        return
    if servido != esperado:
        raise SystemExit(f"O HTML servido ({servido}) difere do local ({esperado}).")
    print(f"Conferido: o HTML servido é idêntico ao local (sha256 {esperado}).")

if __name__ == "__main__":
    main()
