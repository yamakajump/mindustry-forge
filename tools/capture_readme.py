# -*- coding: utf-8 -*-
"""Photograph the live site for the README.

    python tools/capture_readme.py

From production rather than from a local instance, because the whole argument of these
pictures is that the figures are real. A screenshot of an empty development database would
show the product working on data nobody has, which is the one thing this repository spends
its time not doing anywhere else.

The analysis shot goes through the analyser rather than through a catalogue page, and that
is not a stylistic choice: every imported schematic arrived without a preview image, so a
catalogue page renders with an empty black panel where the plan belongs. The analyser draws
the plan itself, in the browser, from the same code the catalogue stores.

Each capture asserts what it is looking at before it shoots. A screenshot of an error page
looks exactly like a screenshot, and that mistake has already cost time here once.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

SITE = "https://mindustryforge.com"
OUT = Path(__file__).resolve().parent.parent / "docs/captures"

#: A real schematic by a real author, picked for three reasons: its name carries no Mindustry
#: colour markup, it produces something, and it holds no sandbox `power-source`, whose
#: catalogue value of 999999.94 per second turns the energy line into a printed infinity.
SCHEMATIC = "cchh3g8oqw"

#: How wide the picture is written. GitHub renders a README about nine hundred pixels wide,
#: so 1400 leaves it sharp on a dense screen without the file landing in every clone at twice
#: the weight it needs.
WIDTH = 1400


def keep(page, selector: str, name: str, height: int | None = None) -> None:
    """Frame one element, shrink it, and write it as a quantised PNG.

    Quantised rather than JPEG: this is interface text on flat colour, where 256 colours cost
    nothing visible and compress better than a photographic encoder does.
    """
    raw = Image.open(io.BytesIO(page.locator(selector).first.screenshot())).convert("RGB")
    if height is not None:
        raw = raw.crop((0, 0, raw.width, min(height, raw.height)))

    small = raw.resize((WIDTH, round(raw.height * WIDTH / raw.width)), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.png"
    small.quantize(colors=256, dither=Image.NONE).save(out, optimize=True)
    print(f"   {out.name:<24} {small.width}x{small.height}  "
          f"{out.stat().st_size / 1024:.0f} kB")


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1320, "height": 1000},
                                device_scale_factor=2)

        code = page.request.get(f"{SITE}/api/schematiques/{SCHEMATIC}/code").text().strip()
        page.goto(f"{SITE}/", wait_until="networkidle")
        page.fill("#text", code)
        page.click("#go")
        page.wait_for_selector("#out .card", timeout=30000)
        page.wait_for_timeout(2000)

        #: Two cards are dropped: one is a save form showing a signed-out state, the other an
        #: empty prompt. Both are right in the product and beside the point in a picture whose
        #: only job is to show what the analysis found.
        page.evaluate("""() => {
          for (const card of document.querySelectorAll('#out .card, .side .card')) {
            const title = card.querySelector('h2');
            if (title && /garder|un bloc/i.test(title.textContent)) card.remove();
          }
        }""")
        page.wait_for_timeout(300)
        keep(page, ".split", "rapport-analyse")

        page.goto(f"{SITE}/blocs/silicon-smelter", wait_until="networkidle")
        if "Silicon smelter" not in page.title():
            raise SystemExit(f"/blocs/silicon-smelter renders {page.title()!r}")
        page.wait_for_timeout(800)
        keep(page, "main", "fiche-bloc", height=1500)

        browser.close()


if __name__ == "__main__":
    main()
