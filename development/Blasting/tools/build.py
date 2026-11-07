#!/usr/bin/env python3
"""Orquestrador de montagem: reúne os módulos no HTML offline distribuível."""

from __future__ import annotations

import argparse
import base64
from collections import Counter
import hashlib
import json
import mimetypes
from pathlib import Path
import re


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def write_exact(path: Path, value: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(value)


def audit_command_catalog(project_root: Path, template: str) -> None:
    """Impede que comandos ou controles estáticos sejam declarados duas vezes."""
    ribbon_path = project_root / "src" / "core" / "parts" / "10-ribbon-ui-preferences.js"
    ribbon = ribbon_path.read_text(encoding="utf-8")
    bindings = re.findall(r"comando\('([^']+)'\s*,\s*'([^']+)'", ribbon)
    repeated_bindings = sorted(key for key, count in Counter(bindings).items() if count > 1)
    if repeated_bindings:
        values = ", ".join(f"{category}:{command}" for category, command in repeated_bindings)
        raise SystemExit(f"Comandos vinculados mais de uma vez: {values}")

    static_ids = re.findall(r'\bid="([A-Za-z][A-Za-z0-9_.:-]*)"', template)
    repeated_ids = sorted(value for value, count in Counter(static_ids).items() if count > 1)
    if repeated_ids:
        raise SystemExit("IDs estáticos duplicados no template: " + ", ".join(repeated_ids))


def build(project_root: Path, verify_reference: bool) -> Path:
    manifest_path = project_root / "src" / "module-order.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    template = (project_root / manifest["template"]).read_text(encoding="utf-8")
    audit_command_catalog(project_root, template)

    expected_order = list(range(1, len(manifest["assets"]) + 1))
    actual_order = [asset["order"] for asset in manifest["assets"]]
    if actual_order != expected_order:
        raise SystemExit("A ordem do manifesto é inválida ou contém lacunas.")

    result = template
    for asset in manifest["assets"]:
        marker = f"<!-- CCMGIS_MODULE:{asset['slot']} -->"
        if result.count(marker) != 1:
            raise SystemExit(f"Marcador ausente ou duplicado: {marker}")

        source_paths = asset.get("parts") or [asset["path"]]
        body = "".join(
            (project_root / "src" / relative).read_text(encoding="utf-8")
            for relative in source_paths
        )
        # Alguns módulos encapsulam aplicações HTML completas em um iframe.
        # O conteúdo é transformado em literal JavaScript durante a montagem,
        # mantendo o `dist` como um único arquivo offline sem achatar o código
        # da aplicação incorporada dentro do orquestrador principal.
        for token, relative in (asset.get("embed_files") or {}).items():
            embedded = (project_root / "src" / relative).read_text(encoding="utf-8")
            literal = json.dumps(embedded, ensure_ascii=False)
            # O parser HTML reconhece </script> mesmo dentro de uma string JS.
            # Escapar a barra conserva o valor do literal e evita encerrar o
            # bloco que hospeda o módulo antes da hora.
            literal = re.sub(r"</script", r"<\\/script", literal, flags=re.IGNORECASE)
            if body.count(token) != 1:
                raise SystemExit(f"Token de incorporação ausente ou duplicado: {token}")
            body = body.replace(token, literal)
        # Recursos binários declarados no manifesto entram como data URI. Isso
        # preserva a distribuição em um único HTML e impede que estilos salvos
        # dependam de caminhos absolutos da máquina onde foram criados.
        for token, entry in (asset.get("embed_binary_files") or {}).items():
            if isinstance(entry, str):
                relative, media_type = entry, None
            else:
                relative = entry["path"]
                media_type = entry.get("mime")
            binary_path = project_root / "src" / relative
            media_type = media_type or mimetypes.guess_type(binary_path.name)[0] or "application/octet-stream"
            encoded = base64.b64encode(binary_path.read_bytes()).decode("ascii")
            literal = f"data:{media_type};base64,{encoded}"
            if body.count(token) != 1:
                raise SystemExit(f"Token binário ausente ou duplicado: {token}")
            body = body.replace(token, literal)
        block = f"{asset['open_tag']}{body}{asset['close_tag']}"
        result = result.replace(marker, block)

    output = project_root / manifest["output"]
    output.parent.mkdir(parents=True, exist_ok=True)
    write_exact(output, result)

    if verify_reference:
        reference = project_root / manifest["source_reference"]
        reference_text = reference.read_text(encoding="utf-8")
        if result != reference_text:
            raise SystemExit(
                "A montagem divergiu da referência original. O arquivo foi gerado, mas não deve ser distribuído."
            )
        print("Verificação: montagem idêntica à referência original.")

    print(f"Gerado: {output}")
    print(f"SHA-256: {sha256_text(result)}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--verify-reference",
        action="store_true",
        help="exige equivalência byte a byte com o original (use antes da primeira alteração funcional)",
    )
    args = parser.parse_args()
    build(args.project_root.resolve(), args.verify_reference)


if __name__ == "__main__":
    main()
