# -*- coding: utf-8 -*-
"""Derive the whole set of brand assets from two source files.

    python tools/build_brand.py

What is written by hand, and what gets edited: `site/public/brand/mark.svg` and
`mark-plain.svg`. Everything else - the logotype, the favicons, the application icons, the
OG image, the Discord artwork - is generated here. A generated asset retouched by hand is
an asset that will diverge from its source at the next regeneration, with nothing to
report it.

The logotype's text is converted to outlines rather than left as <text>: an SVG displayed
in an <img> tag does not load the page's fonts, so a logotype in <text> falls back to the
system font everywhere it matters, starting with the preview of a shared link.
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "site/public/brand"
PUBLIC = ROOT / "site/public"
FONT = PUBLIC / "forge/fonts/forge.woff2"
#: The intermediate renders of the .ico, which have no business in the repository.
TMP = Path(tempfile.gettempdir()) / "forge-brand"

BG = "#12161b"
PANEL = "#1b2027"
EDGE = "#2f3742"
INK = "#e9edf3"
DIM = "#9aa4b2"
ACCENT = "#ffd37f"

SOURCE = BRAND / "mark-plain.svg"


def mark_paths() -> tuple[str, ...]:
    """The mark's paths, read from the one file where they are drawn.

    Copying those four paths into the script would have given two geometries to maintain,
    and the second would have ended up differing from the first with nothing to say so. The
    source SVG is the truth; everything else follows from it.
    """
    return tuple(re.findall(r'<path d="([^"]+)"', SOURCE.read_text(encoding="utf-8")))


def mark_group(fill: str, x: float = 0, y: float = 0, scale: float = 1) -> str:
    """The mark placed at (x, y) and scaled, ready to drop into a larger SVG."""
    paths = "".join(f'<path d="{d}"/>' for d in mark_paths())
    return (f'<g fill="{fill}" transform="translate({x} {y}) scale({scale})">'
            f"{paths}</g>")


# --------------------------------------------------------------------------- typography

def text_paths(font: TTFont, text: str, size: float) -> tuple[str, float]:
    """The text as SVG outlines, and the width it takes up.

    Drawn in the SVG's own frame, so the y axis points down: a font's points up. Hence the
    negative y scale, applied once here rather than by the caller.
    """
    upem = font["head"].unitsPerEm
    scale = size / upem
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    kern = _kern_table(font)

    out, pen_x, previous = [], 0.0, None
    for char in text:
        name = cmap.get(ord(char))
        if name is None:
            raise SystemExit(f"the font does not cover {char!r}: the logotype would be wrong")
        if previous is not None:
            pen_x += kern.get((previous, name), 0)
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        d = pen.getCommands()
        if d:
            out.append(f'<path transform="translate({pen_x * scale:.3f} 0) '
                       f'scale({scale:.6f} {-scale:.6f})" d="{d}"/>')
        pen_x += font["hmtx"][name][0]
        previous = name
    return "".join(out), pen_x * scale


def _kern_table(font: TTFont) -> dict[tuple[str, str], int]:
    """The GPOS pair kerning, flattened.

    Without it, "Mindustry Forge" sets with holes in it: the game's font kerns, and a
    logotype that ignores kerning shows at once beside the same text rendered by the
    browser in the header.
    """
    pairs: dict[tuple[str, str], int] = {}
    if "GPOS" not in font:
        return pairs
    for lookup in font["GPOS"].table.LookupList.Lookup:
        if lookup.LookupType != 2:
            continue
        for sub in lookup.SubTable:
            if sub.Format != 1:
                continue
            for first, sets in zip(sub.Coverage.glyphs, sub.PairSet):
                for record in sets.PairValueRecord:
                    value = getattr(record.Value1, "XAdvance", 0) or 0
                    if value:
                        pairs[(first, record.SecondGlyph)] = value
    return pairs


# ------------------------------------------------------------------------------ logotypes

def run_bounds(font: TTFont, text: str, size: float) -> tuple[float, float, float]:
    """Where a line's ink really runs: its start, its end, and the bottom of its descenders.

    A glyph's advance overhangs its drawing on both sides. Fitting a box to the advance
    leaves a gap to the right of the "e" in Forge that nobody asked for, and that shows the
    moment the logotype is centred in anything.
    """
    from fontTools.pens.boundsPen import BoundsPen

    upem = font["head"].unitsPerEm
    scale = size / upem
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    kern = _kern_table(font)

    pen_x, previous = 0.0, None
    first_ink, last_ink, lowest = None, 0.0, 0.0
    for char in text:
        name = cmap[ord(char)]
        if previous is not None:
            pen_x += kern.get((previous, name), 0)
        bounds = BoundsPen(glyphs)
        glyphs[name].draw(bounds)
        if bounds.bounds:
            x0, y0, x1, _ = bounds.bounds
            if first_ink is None:
                first_ink = (pen_x + x0) * scale
            last_ink = (pen_x + x1) * scale
            lowest = min(lowest, y0 * scale)
        pen_x += font["hmtx"][name][0]
        previous = name
    return first_ink or 0.0, last_ink, lowest


def build_truetype() -> None:
    """The same font, in TrueType, for PHP's image library.

    GD draws text with FreeType, which reads TrueType and OpenType and not WOFF2. So the
    file is not a second font: it is the same subset, taken out of its web wrapper, and it
    is regenerated here so that it cannot diverge from the one the browser loads.

    It lives in resources/ rather than public/: nobody is meant to download it, it only
    serves the server that composes the share cards.
    """
    #: `recalcTimestamp=False` matters more than it looks. fontTools rewrites `head.modified`
    #: **on save**, not on load, so without it the same input produced a different file on
    #: every run: a build that changed nothing left the working tree dirty, with a diff
    #: reading "Bin 28268 -> 28268 bytes" that says nothing about what moved. Setting the
    #: field by hand after loading does not help, which is the trap: the save overwrites it.
    face = TTFont(FONT, recalcTimestamp=False)
    face.flavor = None

    out = ROOT / "site/resources/fonts/forge.ttf"
    out.parent.mkdir(parents=True, exist_ok=True)
    face.save(out)
    print("  ", out.relative_to(ROOT), "%.0f kB" % (out.stat().st_size / 1024))


def build_logos(font: TTFont) -> None:
    """The horizontal lock-up, in two shades and then in one.

    "Mindustry" in ink and "Forge" in amber, exactly as the site's header already writes
    them: a logotype that contradicts the navigation bar right above it reads as two
    brands.
    """
    size = 32
    cap = font["OS/2"].sCapHeight * size / font["head"].unitsPerEm

    #: The mark is scaled so that its stem is exactly one cap height. Its tip then
    #: overshoots the M by two units, which is deliberate: an optical overshoot keeps the
    #: mark from looking smaller than the text.
    stem_units = 20
    scale = cap / stem_units

    one, _ = text_paths(font, "Mindustry ", size)
    two, _ = text_paths(font, "Forge", size)
    _, w1, _ = run_bounds(font, "Mindustry ", size)
    advance1 = _advance(font, "Mindustry ", size)
    ink_start, ink_end, descent = run_bounds(font, "Mindustry Forge", size)

    pad = 4.0
    mark_w = 27 * scale          # from the left edge of the stem to the tip
    gap = round(cap * 0.62, 2)   # breathing room between the mark and the word
    text_x = pad + mark_w + gap - ink_start
    baseline = pad + cap
    width = round(text_x + ink_end + pad, 1)
    height = round(baseline - descent + pad, 1)

    def svg(ink: str, accent: str, mark: str) -> str:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
                f'width="{width}" height="{height}" role="img" aria-label="Mindustry Forge">'
                f"<title>Mindustry Forge</title>"
                f'{mark_group(mark, x=pad - 6 * scale, y=baseline - 26 * scale, scale=scale)}'
                f'<g transform="translate({text_x:.3f} {baseline:.3f})">'
                f'<g fill="{ink}">{one}</g>'
                f'<g fill="{accent}" transform="translate({advance1:.3f} 0)">{two}</g>'
                f"</g></svg>")

    _write(BRAND / "logo.svg", svg(INK, ACCENT, ACCENT))
    _write(BRAND / "logo-mono.svg", svg("currentColor", "currentColor", "currentColor"))


def _advance(font: TTFont, text: str, size: float) -> float:
    """A string's total advance, kerning included: where the next word starts."""
    scale = size / font["head"].unitsPerEm
    cmap, kern = font.getBestCmap(), _kern_table(font)
    total, previous = 0.0, None
    for char in text:
        name = cmap[ord(char)]
        if previous is not None:
            total += kern.get((previous, name), 0)
        total += font["hmtx"][name][0]
        previous = name
    return total * scale


# --------------------------------------------------------------------------- rasterisation

def rasterise(svg_source: str, out: Path, width: int, height: int) -> None:
    """An SVG rendered by a real browser engine, at exactly the size asked for.

    Through Chromium rather than a rendering library: that is the engine that will display
    these files, and two engines do not round an edge the same way.
    """
    _RASTER.append((svg_source, out, width, height))


_RASTER: list[tuple[str, Path, int, int]] = []


def flush_raster() -> None:
    from playwright.sync_api import sync_playwright

    TMP.mkdir(exist_ok=True)

    if not _RASTER:
        return
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for svg_source, out, width, height in _RASTER:
            page.set_viewport_size({"width": width, "height": height})
            page.set_content(
                f'<html><body style="margin:0;width:{width}px;height:{height}px;'
                f'overflow:hidden">{svg_source}</body></html>')
            page.eval_on_selector(
                "svg", f"s => {{ s.setAttribute('width', {width}); "
                       f"s.setAttribute('height', {height}); s.style.display='block'; }}")
            page.wait_for_timeout(60)
            out.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out), omit_background=True)
            label = out.relative_to(ROOT) if ROOT in out.parents else out.name
            print("  ", label, f"{width}x{height}")
        browser.close()
    _RASTER.clear()


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("  ", path.relative_to(ROOT))



# ------------------------------------------------------------------------------- the icons

def plate(size: int, mark_ratio: float, radius_ratio: float, *,
          relief: bool = True, plate_fill: str = PANEL) -> str:
    """A square plate with the mark placed at the optical centre.

    `mark_ratio` is the share of the width the mark takes. It varies from one target to
    the next because systems do not crop alike: Android cuts a circle out of the maskable
    icon, iOS rounds the corners itself, a browser tab crops nothing.
    """
    unit = size / 32
    span_x, span_y = 21, 22          # the drawing's extent: x from 6 to 27, y from 4 to 26
    scale = size * mark_ratio / span_x
    x = (size - span_x * scale) / 2 - 6 * scale
    y = (size - span_y * scale) / 2 - 4 * scale
    rx = size * radius_ratio
    edge = (f'<rect x="{unit}" y="{unit}" width="{size - 2 * unit}" '
            f'height="{size - 2 * unit}" rx="{max(rx - unit, 0)}" fill="none" '
            f'stroke="{EDGE}" stroke-width="{unit * 2}"/>') if relief else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}">'
            f'<rect width="{size}" height="{size}" rx="{rx}" fill="{plate_fill}"/>{edge}'
            f"{mark_group(ACCENT, x=x, y=y, scale=scale)}</svg>")


def build_icons() -> None:
    """The full set, one entry per way a platform will display the brand."""

    #: The mark on its plate, generously framed: this is the version that goes into a
    #: document, a README or a presentation, never into a browser tab.
    _write(BRAND / "mark.svg", plate(32, 0.66, 0.22, relief=False, plate_fill=BG))

    #: The tab icon, framed tighter. At 16 pixels the mark is only eight pixels tall: every
    #: point handed back to the drawing is a point gained in legibility. No relief either,
    #: a two unit border would eat the contrast there.
    favicon = plate(32, 0.76, 0.20, relief=False, plate_fill=BG)
    _write(PUBLIC / "favicon.svg", favicon)
    flat = favicon

    #: The .ico, for the browsers and aggregators that still ask for /favicon.ico without
    #: looking at the <head>. Three sizes in one file.
    for s in (16, 32, 48):
        rasterise(flat, TMP / f"ico-{s}.png", s, s)

    #: iOS rounds the corners itself and ignores transparency. So square corners and a
    #: solid background: an already rounded icon comes out doubly rounded with a black rim.
    rasterise(plate(180, 0.60, 0.0, relief=False), PUBLIC / "apple-touch-icon.png",
              180, 180)

    #: The two sizes a manifest asks for, as `purpose: any`.
    for s in (192, 512):
        rasterise(plate(s, 0.60, 0.22), PUBLIC / f"icon-{s}.png", s, s)

    #: The maskable icon. Android cuts whatever shape it likes out of it, and guarantees
    #: only the middle 80 per cent. So the mark goes down to 46 per cent of the width,
    #: which leaves it whole even inside the tightest circle.
    rasterise(plate(512, 0.46, 0.0, relief=False, plate_fill=BG),
              PUBLIC / "icon-maskable-512.png", 512, 512)

    #: The mark alone, on a transparent background, for the server that composes the share
    #: cards. PHP pastes it as it is rather than redrawing its four paths: a second geometry
    #: written in another language is a second geometry that can be wrong, and that one
    #: would have diverged with nobody looking.
    transparent = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
                   f"{mark_group(ACCENT)}</svg>")
    rasterise(transparent, ROOT / "site/resources/brand/mark-96.png", 96, 96)

    #: The Discord server icon, shown as a circle and often at 32 pixels in a list.
    rasterise(plate(512, 0.62, 0.5, relief=False, plate_fill=BG),
              BRAND / "discord-icon.png", 512, 512)


def build_ico() -> None:
    """The three sizes gathered into one .ico, after rasterisation."""
    TMP.mkdir(exist_ok=True)
    frames = [Image.open(TMP / f"ico-{s}.png").convert("RGBA") for s in (16, 32, 48)]
    frames[2].save(PUBLIC / "favicon.ico", format="ICO",
                   sizes=[(48, 48), (32, 32), (16, 16)])
    for f in frames:
        f.close()
    print("   site/public/favicon.ico  16+32+48")



# ---------------------------------------------------------------------- the shared images

#: The backdrop artwork, produced once by a model and versioned as it came out. It is not
#: regenerated on every pass: a model's output is not reproducible, and a brand whose
#: illustration changes with every build is not a brand.
BACKDROP = BRAND / "fond-usine.png"


def tritone(image: "Image.Image") -> "Image.Image":
    """Bring any image back into the site's three tones.

    The model rendered a navy and orange factory. It is right in shape and wrong in colour,
    and laying an amber accent over a navy background gives two yellows fighting each other.
    So only the luminance is read, and it is replayed on the background -> panel -> accent
    ramp: the drawing stays, the palette goes.

    The ramp is first stretched over the range actually occupied, rather than over 0-255. A
    night image sits entirely in the bottom of the scale: measured on this one, 99 per cent
    of the pixels are below 79. A ramp spread over the whole scale therefore sent the entire
    factory into the two darkest tones, the amber was never reached, and the result looked
    like compression noise rather than a factory.
    """
    stops = ((0.00, (0x0b, 0x0e, 0x12)), (0.30, (0x1b, 0x21, 0x29)),
             (0.55, (0x39, 0x42, 0x50)), (0.78, (0xc2, 0x92, 0x4e)),
             (1.00, (0xff, 0xd3, 0x7f)))
    grey = image.convert("L")
    low, high = _plage(grey, 0.02, 0.998)
    span = max(high - low, 1)

    ramp = []
    for value in range(256):
        t = min(max((value - low) / span, 0.0), 1.0)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= t <= b:
                k = (t - a) / (b - a)
                ramp.append(tuple(round(ca[j] + (cb[j] - ca[j]) * k) for j in range(3)))
                break
        else:
            ramp.append(stops[-1][1])

    #: The ramp is applied as a palette rather than pixel by pixel: a million point image
    #: walked in Python costs a second and a Pillow deprecation, where a palette is exactly
    #: what a lookup table is.
    out = Image.frombytes("P", grey.size, grey.tobytes())
    out.putpalette([canal for couleur in ramp for canal in couleur])
    return out.convert("RGB")


def _plage(grey: "Image.Image", bas: float, haut: float) -> tuple[int, int]:
    """The two levels the image really lives between, setting the extremes aside.

    Taking the raw minimum and maximum would have let one stray pixel decide how the whole
    image is stretched.
    """
    histogram = grey.histogram()
    total = sum(histogram)
    seuils, accumulated, found = (bas * total, haut * total), 0, []
    for level, count in enumerate(histogram):
        accumulated += count
        while len(found) < 2 and accumulated >= seuils[len(found)]:
            found.append(level)
    while len(found) < 2:
        found.append(255)
    return found[0], found[1]


def backdrop_uri(width: int, height: int, darken: float) -> str:
    """The graded backdrop, cropped to the size asked for then darkened, as a data URI."""
    import base64
    from io import BytesIO

    graded = tritone(Image.open(BACKDROP).convert("RGB"))

    #: Crop by filling: cover the box without ever distorting the factory, whose square
    #: grid would show as bent at the first stretch.
    ratio = max(width / graded.width, height / graded.height)
    resized = graded.resize((round(graded.width * ratio), round(graded.height * ratio)),
                            Image.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    cropped = resized.crop((left, top, left + width, top + height))

    final = Image.blend(cropped, Image.new("RGB", cropped.size, (0x0d, 0x10, 0x14)), darken)
    buffer = BytesIO()
    final.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def font_uri() -> str:
    """The site's font, embedded: the render must not depend on any network."""
    import base64

    return "data:font/woff2;base64," + base64.b64encode(FONT.read_bytes()).decode()


def social_html(width, height, *, lines, kicker, scale, darken, safe=0, foot=None):
    """The social card, in HTML rather than SVG.

    SVG would have meant converting every line to outlines. HTML renders the text with the
    real font and the real letter-spacing settings, and Chromium does the rasterising, so
    it is exactly the engine that already displays the site.
    """
    logo = (BRAND / "logo.svg").read_text(encoding="utf-8")
    foot = "mindustryforge.com" if foot is None else foot
    body = "".join("<span>%s</span>" % line for line in lines)
    px = lambda v: round(v * scale)
    return """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Forge"; src: url("%(font)s") format("woff2"); }
* { margin: 0; box-sizing: border-box; }
body { width: %(w)dpx; height: %(h)dpx; overflow: hidden;
  font-family: "Forge", sans-serif; color: %(ink)s; background: %(bg)s; }
.carte { position: relative; width: 100%%; height: 100%%; }
.fond { position: absolute; inset: 0; width: 100%%; height: 100%%; object-fit: cover; }
/* A veil starting from the edge where the text lives. Without it, an amber machine passing
   under an amber letter makes the letter disappear, and that is only discovered once the
   link has been shared. */
.voile { position: absolute; inset: 0;
  background: linear-gradient(100deg, %(bg)sfa 0%%, %(bg)sf0 40%%, %(bg)s99 62%%,
    %(bg)s3d 82%%, %(bg)s1a 100%%); }
.bord { position: absolute; inset: 0; border: %(edgew)dpx solid %(edge)s; }
.dedans { position: absolute; inset: 0; padding: %(padsafe)dpx; display: flex;
  flex-direction: column; justify-content: center; gap: %(gap)dpx; }
.logo img { height: %(logoh)dpx; display: block; }
h1 { font-size: %(h1)dpx; line-height: 1.18; font-weight: 400;
  display: flex; flex-direction: column; }
/* Every line of the title is a decision, not a wrap computed by the browser: a line that
   breaks on its own breaks in the wrong place, and nobody sees it before the link is
   shared. */
h1 span { white-space: nowrap; }
h1 em { font-style: normal; color: %(accent)s; }
.regle { width: %(rulew)dpx; height: %(ruleh)dpx; background: %(accent)s; }
.kicker { color: %(dim)s; font-size: %(kick)dpx; letter-spacing: %(track).2fpx;
  text-transform: uppercase; }
.pied { position: absolute; right: %(footx)dpx; bottom: %(footb)dpx; color: %(dim)s;
  font-size: %(foot)dpx; }
</style></head><body><div class="carte">
<img class="fond" src="%(backdrop)s" alt="">
<div class="voile"></div><div class="bord"></div>
<div class="dedans">
  <div class="logo">%(logo)s</div>
  <h1>%(body)s</h1>
  <div class="regle"></div>
  <div class="kicker">%(kicker)s</div>
</div>
<div class="pied">%(footlabel)s</div>
</div></body></html>""" % {
        "font": font_uri(), "w": width, "h": height, "ink": INK, "bg": BG, "edge": EDGE,
        "accent": ACCENT, "dim": DIM, "backdrop": backdrop_uri(width, height, darken),
        "logo": logo, "body": body, "kicker": kicker,
        "edgew": px(6), "pad": px(62), "gap": px(26), "logoh": px(46), "h1": px(58),
        "maxw": px(780), "rulew": px(72), "ruleh": px(4), "kick": px(21),
        "track": 2.4 * scale, "foot": px(22), "footb": px(50) + safe,
        "safe": safe, "padsafe": px(62) + safe, "footx": px(62) + safe,
        "footlabel": foot,
    }


def _jpeg(page, out: Path, width: int, height: int) -> None:
    """Photograph the page, then write JPEG rather than PNG.

    A PNG of this card weighs 538 kB, because the factory backdrop is photographic and no
    quantisation catches up with it: without dithering it stays at 280 kB, and with
    dithering the added noise cancels the gain. The same artwork as JPEG at quality 88
    weighs 69 kB, and amber text on a dark background shows no visible artefact in it.

    This is not fussing over bytes: a share image is re-downloaded by every service that
    unfurls the link, every time it unfurls it.
    """
    from io import BytesIO

    shot = Image.open(BytesIO(page.screenshot())).convert("RGB")
    shot.save(out, format="JPEG", quality=88, optimize=True, progressive=True)
    print("  ", out.relative_to(ROOT), "%dx%d" % (width, height),
          "%.0f kB" % (out.stat().st_size / 1024))


def build_social() -> None:
    """The images nobody chooses to show: they arrive with the link."""
    from playwright.sync_api import sync_playwright

    #: Here the text carries its accents, where the rest of the site leaves them off. That
    #: is deliberate: the font covers all of them, verified glyph by glyph, and
    #: "schematique" without accents in the thumbnail of a link shared on Discord reads as
    #: a broken encoding. An inconsistency can be fixed later, a first impression cannot.
    cartes = (
        ("og.jpg", 1200, 630, 1.0, 0.22,
         ["Colle une schématique.", "<em>Sache où elle coince.</em>"],
         "D\u00e9bits \u00b7 \u00c9nergie \u00b7 Goulot d'\u00e9tranglement"),
        ("og-schematiques.jpg", 1200, 630, 1.0, 0.22,
         ["Des milliers de sch\u00e9matiques,", "<em>mesur\u00e9es, pas not\u00e9es.</em>"],
         "Parcourir \u00b7 Comparer \u00b7 Analyser"),
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, w, h, scale, dark, lines, kicker in cartes:
            page = browser.new_page(viewport={"width": w, "height": h})
            page.set_content(social_html(w, h, lines=lines, kicker=kicker,
                                         scale=scale, darken=dark))
            page.wait_for_timeout(350)
            _jpeg(page, PUBLIC / name, w, h)
            page.close()

        #: The Discord banner, at the size the server displays at the top of a list.
        page = browser.new_page(viewport={"width": 960, "height": 540})
        page.set_content(social_html(
            960, 540, scale=0.86, darken=0.20,
            lines=["Analyse ta sch\u00e9matique", "<em>avant de la poser.</em>"],
            kicker="Outil libre \u00b7 AGPL-3.0"))
        page.wait_for_timeout(350)
        _jpeg(page, BRAND / "discord-banniere.jpg", 960, 540)
        page.close()
        browser.close()



# --------------------------------------------------------------- the repository's artwork

def build_repo() -> None:
    """What GitHub shows before anyone has read a line.

    Composed from the same source as everything else, and not generated. There is a mark, a
    palette taken from the game, a typeface and one script that produces all of it; an
    illustration made alongside would be a second identity, which is what this repository's
    own art direction forbids and what the test on the three copies of the mark prevents.

    The wording leads with the argument rather than the name. Repeating "Mindustry Forge"
    next to a logo that already says it teaches a reader nothing, and what separates this
    project from the four calculators it competes with fits in one sentence.

    In English, where the site is in French: the repository is read by contributors, the
    rule for everything they read is English, and a Mindustry audience is international.
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()

        #: The social preview, at the size GitHub asks for. It is cropped differently by
        #: GitHub, by Discord and by Twitter, so nothing is allowed near the edge: `safe`
        #: pushes the whole block inwards and the corner that one of them eats stays empty.
        page = browser.new_page(viewport={"width": 1280, "height": 640})
        page.set_content(social_html(
            1280, 640, scale=1.0, darken=0.22, safe=34,
            lines=["The numbers are measured", "<em>by running the game.</em>"],
            kicker="Mindustry schematic analysis",
            foot="mindustryforge.com  \u00b7  AGPL-3.0"))
        page.wait_for_timeout(350)
        _jpeg(page, BRAND / "depot-apercu.jpg", 1280, 640)
        page.close()

        #: The README header. Shorter, because GitHub renders a README about nine hundred
        #: pixels wide and a banner as tall as the social preview would push the first
        #: sentence below the fold.
        page = browser.new_page(viewport={"width": 1280, "height": 360})
        page.set_content(social_html(
            1280, 360, scale=0.72, darken=0.24,
            lines=["Paste a schematic.", "<em>Find out what it actually does.</em>"],
            kicker="Measured against the game, not claimed",
            foot="mindustryforge.com"))
        page.wait_for_timeout(350)
        _jpeg(page, BRAND / "depot-entete.jpg", 1280, 360)
        page.close()

        browser.close()


if __name__ == "__main__":
    font = TTFont(FONT)
    print("logotypes")
    build_logos(font)
    print("font for the server")
    build_truetype()
    print("icons")
    build_icons()
    flush_raster()
    build_ico()
    print("shared images")
    build_social()
    print("repository artwork")
    build_repo()
