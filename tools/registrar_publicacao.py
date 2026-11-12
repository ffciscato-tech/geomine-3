"""Registra no repositório a versão que acabou de ser publicada no site.

Uso (depois de tools/publicar_firebase.py --live):
    python3 -I -X utf8 tools/registrar_publicacao.py --notas "O que mudou" --commit abc1234

Atualiza CURRENT_RELEASE.json (hashes, notas e horário) e a tabela de hashes do
README.md com os valores de dist/GeoMine.html e public/index.html. Não publica
nada: só grava os arquivos, que depois entram no commit.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
from pathlib import Path


def trocar(texto: str, chave: str, valor: str) -> str:
    """Troca o valor de uma chave do nível superior do JSON sem reformatar o arquivo."""
    padrao = re.compile(r'^(  "%s"\s*:\s*)"(?:[^"\\]|\\.)*"' % re.escape(chave), re.M)
    if len(padrao.findall(texto)) != 1:
        raise SystemExit(f'Chave "{chave}" não encontrada uma única vez no nível superior.')
    return padrao.sub(lambda m: m.group(1) + json.dumps(valor, ensure_ascii=False), texto, count=1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--notas", required=True, help="o que mudou nesta publicação")
    parser.add_argument("--commit", default="", help="commit do repositório que foi publicado")
    parser.add_argument("--raiz", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    raiz = args.raiz.resolve()

    dist = hashlib.sha256((raiz / "dist/GeoMine.html").read_bytes()).hexdigest()
    publico = hashlib.sha256((raiz / "public/index.html").read_bytes()).hexdigest()
    agora = datetime.datetime.now(datetime.timezone.utc)
    brasilia = agora - datetime.timedelta(hours=3)
    quando = brasilia.strftime("%d/%m/%Y às %Hh%M")
    notas = args.notas.strip()
    if args.commit:
        notas += f" Publicado em {quando} (horário de Brasília) a partir do commit {args.commit}."

    registro = raiz / "CURRENT_RELEASE.json"
    texto = registro.read_text(encoding="utf-8")
    anterior = json.loads(texto)["distSha256"]
    if anterior != dist:
        texto = trocar(texto, "previousDistSha256", anterior)
    texto = trocar(texto, "distSha256", dist)
    texto = trocar(texto, "publishedSha256", publico)
    texto = trocar(texto, "preparedPublicSha256", publico)
    texto = trocar(texto, "releaseNotes", notas)
    texto = trocar(texto, "sourceUpdatedAt", agora.isoformat())
    json.loads(texto)
    registro.write_text(texto, encoding="utf-8")

    leia = raiz / "README.md"
    conteudo = leia.read_text(encoding="utf-8")
    conteudo, n1 = re.subn(r"(\| `dist/GeoMine.html` \| `)[0-9a-f]{64}(` \|)", r"\g<1>" + dist + r"\2", conteudo)
    conteudo, n2 = re.subn(r"(\| `public/index.html` \| `)[0-9a-f]{64}(` \|)", r"\g<1>" + publico + r"\2", conteudo)
    conteudo, n3 = re.subn(
        r"versão publicada em \d{2}/\d{2}/\d{4} às \d{2}h\d{2}",
        "versão publicada em " + quando, conteudo, count=1)
    if (n1, n2, n3) != (1, 1, 1):
        raise SystemExit("README.md: tabela de hashes ou data da versão não encontrada.")
    leia.write_text(conteudo, encoding="utf-8")
    print(f"Registrado: dist {dist}\n            public {publico}\n            {quando} (Brasília)")


if __name__ == "__main__":
    main()
