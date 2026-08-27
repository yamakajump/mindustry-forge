"""Coller une schematique dans le vrai jeu, et noter ce qu'il en lit.

    python tools/build_logic_paste.py

Le programme d'un processeur sort de trois formats emboites : la schematique, la
configuration d'une case, le bloc compresse du programme. Les trois sont ecrits dans ce
depot, et un aller-retour entre eux ne prouve qu'une chose, que ce code est d'accord avec
ce code.

Alors : `tools/js/logique-collee.mjs` fabrique la schematique, `tools/LogicPaste.java` la
donne a `Schematics.readBase64` comme le fait la touche coller du jeu, et le verdict part
dans `bench/data/logique-collee.json`. Le test le relit sans avoir besoin d'une JVM.

Ce que ca a trouve du premier coup : l'octet de version d'une configuration de processeur
vaut 1, pas 0. Les deux se relisent, parce que le lecteur du jeu le jette, donc l'erreur
etait invisible d'ici. `matches_game_writer` est le champ qui l'a dite.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

BUILDER = Path("tools/js/logique-collee.mjs")
PASTE = Path("tools/LogicPaste.java")
TARGET = Path("bench/data/logique-collee.json")

#: Où les autres scripts du dépôt vont chercher le jeu, depuis le dossier parent.
DEFAULT_CLASSES = Path("../mindustry-ai/mindustry-env/server-release.jar")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--classes", type=Path, default=DEFAULT_CLASSES)
    parser.add_argument("--target", type=Path, default=TARGET)
    args = parser.parse_args()

    if not args.classes.exists():
        raise SystemExit(f"introuvable : {args.classes}")

    built = subprocess.run(["node", str(BUILDER)], capture_output=True, text=True,
                           encoding="utf-8")
    if built.returncode or not built.stdout.strip():
        raise SystemExit(built.stderr.strip() or "node n'a rien ecrit")

    seen = subprocess.run(["java", "-cp", str(args.classes), str(PASTE)],
                          input=built.stdout, capture_output=True, text=True,
                          encoding="utf-8")
    if seen.returncode:
        raise SystemExit(seen.stderr.strip() or "java a echoue")

    # Le jeu bavarde sur ses secteurs au chargement du contenu ; seule la derniere ligne
    # est la reponse.
    verdict = json.loads(seen.stdout.strip().splitlines()[-1])
    args.target.write_text(
        json.dumps(verdict, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    processors = verdict.get("processors", [])
    same = all(entry.get("matches_game_writer") for entry in processors)
    print(f"{args.target} : {len(processors)} processeur(s) relu(s) par le jeu, "
          f"octets identiques a son propre ecrivain : {'oui' if same else 'NON'}")


if __name__ == "__main__":
    main()
