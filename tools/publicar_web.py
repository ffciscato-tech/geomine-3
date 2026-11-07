#!/usr/bin/env python3
"""Prepara a pasta de publicação web (Firebase Hosting) do GeoMine.

O aplicativo distribuído continua sendo o arquivo único offline gerado por
tools/build.py. Esta etapa NÃO altera o dist: ela monta uma pasta `public/`
com uma cópia do aplicativo acrescida da guarda de sessão, mais a tela de
login, ambas com a configuração do Firebase preenchida.

    python3 tools/publicar_web.py --config web/firebase-config.json

O arquivo de configuração é o objeto `firebaseConfig` que o console do
Firebase mostra ao registrar um aplicativo da Web, gravado como JSON.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil


MARCADOR = "__FIREBASE_CONFIG__"


def texto(caminho: Path) -> str:
    return caminho.read_text(encoding="utf-8")


def grava(caminho: Path, valor: str) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with caminho.open("w", encoding="utf-8", newline="") as stream:
        stream.write(valor)


def preenche(modelo: str, config: dict) -> str:
    if modelo.count(MARCADOR) != 1:
        raise SystemExit(f"Marcador {MARCADOR} ausente ou duplicado no modelo.")
    return modelo.replace(MARCADOR, json.dumps(config, ensure_ascii=False, indent=2))


def publica(raiz: Path, config_path: Path | None, projeto: str | None) -> Path:
    """Monta a pasta public/.

    Com --config, o site ganha tela de login (Google) e guarda de sessão.
    Com --projeto, publica o aplicativo direto na raiz, sem portão nenhum —
    é o modo em que basta o ID do projeto para o deploy.
    """
    config = json.loads(texto(config_path)) if config_path else None
    if config is not None:
        faltando = [c for c in ("apiKey", "authDomain", "projectId", "appId", "storageBucket")
                    if not config.get(c)]
        if faltando:
            raise SystemExit("Configuração do Firebase incompleta: " + ", ".join(faltando))
        projeto = config["projectId"]
    if not projeto:
        raise SystemExit("Informe --config ou --projeto.")

    dist = raiz / "dist" / "GeoMine.html"
    if not dist.exists():
        raise SystemExit("dist/GeoMine.html não existe — rode tools/build.py antes.")

    publico = raiz / "public"
    if publico.exists():
        shutil.rmtree(publico)
    publico.mkdir(parents=True)

    app = texto(dist)
    alvo = "index.html"
    if config is not None:
        # Endereço único: o aplicativo com o portão de sessão por cima,
        # inserido antes do último </body>.
        portao = preenche(texto(raiz / "web" / "gate.template.html"), config)
        corte = app.rfind("</body>")
        if corte < 0:
            raise SystemExit("Não achei </body> no dist — o portão não pôde ser inserido.")
        grava(publico / alvo, app[:corte] + portao + app[corte:])
    else:
        # Sem portão: o aplicativo publicado como está
        grava(publico / alvo, app)

    # Configuração do Firebase. Preserva chaves de outros serviços que já
    # existam no arquivo e atualiza somente o que esta etapa administra.
    # Assim preparar uma nova publicação não volta a apagar as regras da
    # colaboração (Firestore/Storage), como ocorria quando só Hosting era
    # regravado.
    firebase_path = raiz / "firebase.json"
    firebase = {}
    if firebase_path.exists():
        try:
            carregado = json.loads(texto(firebase_path))
            if isinstance(carregado, dict):
                firebase = carregado
        except json.JSONDecodeError as exc:
            raise SystemExit(f"firebase.json inválido: {exc}") from exc

    firebase["hosting"] = {
            "public": "public",
            "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
            # A regra vale para "**" e não para "/index.html": o navegador pede
            # "/", que aquele padrão não casa — foi assim que uma versão antiga
            # ficou uma hora em cache apontando para um arquivo já removido.
            # Sendo o site um HTML único, revalidar sempre não custa nada.
            "headers": [
                {
                    "source": "**",
                    "headers": [
                        {"key": "Cache-Control", "value": "no-cache, no-store, must-revalidate"},
                        {"key": "X-Robots-Tag", "value": "noindex, nofollow"},
                    ],
                },
            ],
            "cleanUrls": False,
    }
    firestore = firebase.get("firestore") if isinstance(firebase.get("firestore"), dict) else {}
    firestore.update({"rules": "firestore.rules", "indexes": "firestore.indexes.json"})
    firebase["firestore"] = firestore
    storage = firebase.get("storage") if isinstance(firebase.get("storage"), dict) else {}
    storage.update({"rules": "storage.rules"})
    firebase["storage"] = storage

    grava(firebase_path, json.dumps(firebase, ensure_ascii=False, indent=2) + "\n")
    grava(raiz / ".firebaserc",
          json.dumps({"projects": {"default": projeto}}, ensure_ascii=False, indent=2) + "\n")

    tam = f"{(publico / alvo).stat().st_size:,}".replace(",", ".")
    print(f"Publicação preparada em {publico}")
    if config is not None:
        print(f"  index.html  — GeoMine + portão de sessão (Google) ({tam} bytes)")
    else:
        print(f"  index.html  — GeoMine, sem portão de login ({tam} bytes)")
    print(f"  projeto     — {projeto}")
    print("\nDeploy:  firebase deploy --only hosting,firestore:rules,firestore:indexes,storage --project " + projeto)
    return publico


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    p.add_argument("--config", type=Path,
                   help="JSON com o firebaseConfig do app da Web — ativa a tela de login")
    p.add_argument("--projeto", help="ID do projeto, para publicar sem tela de login")
    a = p.parse_args()
    publica(a.project_root.resolve(),
            a.config.resolve() if a.config else None,
            a.projeto)


if __name__ == "__main__":
    main()
