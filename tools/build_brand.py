# -*- coding: utf-8 -*-
"""Derive tout le jeu d'assets de marque a partir de deux fichiers sources.

    python tools/build_brand.py

Ce qui est ecrit a la main, et qu'on modifie : `site/public/brand/mark.svg` et
`mark-plain.svg`. Tout le reste - le logotype, les favicons, les icones d'application,
l'image OG, les visuels Discord - est genere ici. Un asset genere qu'on retouche a la main
est un asset qui divergera de sa source des la prochaine regeneration, sans que rien ne le
signale.

Le texte du logotype est converti en contours plutot que laisse en <text> : un SVG affiche
dans une balise <img> ne charge pas les polices de la page, donc un logotype en <text>
tombe sur la police systeme partout ou il compte, a commencer par l'apercu d'un lien.
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
#: Les rendus intermediaires du .ico, qui n'ont rien a faire dans le depot.
TMP = Path(tempfile.gettempdir()) / "forge-brand"

BG = "#12161b"
PANEL = "#1b2027"
EDGE = "#2f3742"
INK = "#e9edf3"
DIM = "#9aa4b2"
ACCENT = "#ffd37f"

SOURCE = BRAND / "mark-plain.svg"


def mark_paths() -> tuple[str, ...]:
    """Les chemins du signe, lus dans l'unique fichier ou ils sont dessines.

    Recopier ces quatre chemins dans le script aurait donne deux geometries a maintenir, et
    la deuxieme aurait fini par differer de la premiere sans que rien ne le dise. Le SVG
    source est la verite ; tout le reste en decoule.
    """
    return tuple(re.findall(r'<path d="([^"]+)"', SOURCE.read_text(encoding="utf-8")))


def mark_group(fill: str, x: float = 0, y: float = 0, scale: float = 1) -> str:
    """Le signe pose a (x, y) et mis a l'echelle, prêt a etre insere dans un plus grand SVG."""
    paths = "".join(f'<path d="{d}"/>' for d in mark_paths())
    return (f'<g fill="{fill}" transform="translate({x} {y}) scale({scale})">'
            f"{paths}</g>")


# --------------------------------------------------------------------------- typographie

def text_paths(font: TTFont, text: str, size: float) -> tuple[str, float]:
    """Le texte en contours SVG, et la largeur qu'il occupe.

    Rendu dans le repere du SVG, donc l'axe des y descend : la police, elle, monte. D'ou
    l'echelle negative en y, appliquee une fois ici plutot que par l'appelant.
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
            raise SystemExit(f"la police ne couvre pas {char!r} : le logotype serait faux")
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
    """Le crenage par paires du GPOS, aplati.

    Sans lui, « Mindustry Forge » compose avec des trous : la police du jeu crene, et un
    logotype qui ignore le crenage se voit tout de suite a cote du meme texte rendu par le
    navigateur dans l'en-tete.
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
    """L'etendue reelle de l'encre d'une ligne : depart, arrivee, et le bas des jambages.

    La chasse d'un glyphe deborde de son dessin des deux cotes. Caler une boite sur la
    chasse laisse un blanc a droite du « e » de Forge que personne n'a demande, et qui se
    voit des qu'on centre le logotype dans quoi que ce soit.
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
    """La meme police, en TrueType, pour la bibliotheque d'images de PHP.

    GD dessine du texte avec FreeType, qui lit du TrueType et de l'OpenType et pas du
    WOFF2. Le fichier n'est donc pas une deuxieme police : c'est le meme sous-ensemble,
    sorti de son enveloppe web, et il se regenere ici pour qu'il ne puisse pas diverger de
    celui que le navigateur charge.

    Il vit dans resources/ et pas dans public/ : personne ne doit le telecharger, il ne
    sert qu'au serveur qui compose les cartes de partage.
    """
    face = TTFont(FONT)
    face.flavor = None
    out = ROOT / "site/resources/fonts/forge.ttf"
    out.parent.mkdir(parents=True, exist_ok=True)
    face.save(out)
    print("  ", out.relative_to(ROOT), "%.0f ko" % (out.stat().st_size / 1024))


def build_logos(font: TTFont) -> None:
    """Le lock-up horizontal, en deux teintes puis en une seule.

    « Mindustry » en encre et « Forge » en ambre, comme l'en-tete du site les ecrit deja :
    un logotype qui contredit la barre de navigation juste au-dessus de lui donne
    l'impression de deux marques.
    """
    size = 32
    cap = font["OS/2"].sCapHeight * size / font["head"].unitsPerEm

    #: Le signe est mis a l'echelle pour que sa hampe fasse exactement une hauteur de
    #: capitale. Sa pointe deborde alors de deux unites au-dessus du M, ce qui est voulu :
    #: un debord optique empeche le signe de paraitre plus petit que le texte.
    stem_units = 20
    scale = cap / stem_units

    one, _ = text_paths(font, "Mindustry ", size)
    two, _ = text_paths(font, "Forge", size)
    _, w1, _ = run_bounds(font, "Mindustry ", size)
    advance1 = _advance(font, "Mindustry ", size)
    ink_start, ink_end, descent = run_bounds(font, "Mindustry Forge", size)

    pad = 4.0
    mark_w = 27 * scale          # du bord gauche de la hampe a la pointe
    gap = round(cap * 0.62, 2)   # respiration entre le signe et le mot
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
    """La chasse totale d'une chaine, crenage compris : ou commence le mot suivant."""
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
    """Un SVG rendu par un vrai moteur de navigateur, a la taille exacte demandee.

    Passe par Chromium plutot que par une bibliotheque de rendu : c'est le moteur qui
    affichera ces fichiers, et deux moteurs n'arrondissent pas les bords de la meme facon.
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



# ----------------------------------------------------------------------------- les icones

def plate(size: int, mark_ratio: float, radius_ratio: float, *,
          relief: bool = True, plate_fill: str = PANEL) -> str:
    """Une plaque carree avec le signe pose au centre optique.

    `mark_ratio` est la part de la largeur que prend le signe. Il varie d'une cible a
    l'autre parce que les systemes ne rognent pas pareil : Android decoupe un cercle dans
    l'icone masquable, iOS arrondit les coins lui-meme, un onglet ne rogne rien.
    """
    unit = size / 32
    span_x, span_y = 21, 22          # l'etendue du dessin : x de 6 a 27, y de 4 a 26
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
    """Le jeu complet, une entree par facon dont une plateforme affichera la marque."""

    #: Le signe sur sa plaque, cadrage genereux : c'est la version qu'on pose dans un
    #: document, un README ou une presentation, jamais celle d'un onglet.
    _write(BRAND / "mark.svg", plate(32, 0.66, 0.22, relief=False, plate_fill=BG))

    #: L'icone d'onglet, cadree plus serre. A 16 pixels le signe n'a que huit pixels de
    #: haut : chaque point rendu au dessin est un point gagne sur la lisibilite. Pas de
    #: relief non plus, un lisere de deux unites y mangerait le contraste.
    favicon = plate(32, 0.76, 0.20, relief=False, plate_fill=BG)
    _write(PUBLIC / "favicon.svg", favicon)
    flat = favicon

    #: Le .ico, pour les navigateurs et les agregateurs qui demandent encore /favicon.ico
    #: sans regarder le <head>. Trois tailles dans un seul fichier.
    for s in (16, 32, 48):
        rasterise(flat, TMP / f"ico-{s}.png", s, s)

    #: iOS arrondit lui-meme les coins et ignore la transparence. Donc coins carres, fond
    #: plein : une icone deja arrondie ressort avec un double arrondi et un liseré noir.
    rasterise(plate(180, 0.60, 0.0, relief=False), PUBLIC / "apple-touch-icon.png",
              180, 180)

    #: Les deux tailles que reclame un manifest, en `purpose: any`.
    for s in (192, 512):
        rasterise(plate(s, 0.60, 0.22), PUBLIC / f"icon-{s}.png", s, s)

    #: L'icone masquable. Android y decoupe la forme de son choix, et ne garantit que les
    #: 80 pour cent du centre. Le signe descend donc a 46 pour cent de la largeur, ce qui
    #: le laisse entier meme dans le cercle le plus serré.
    rasterise(plate(512, 0.46, 0.0, relief=False, plate_fill=BG),
              PUBLIC / "icon-maskable-512.png", 512, 512)

    #: Le signe seul, sur fond transparent, pour le serveur qui compose les cartes de
    #: partage. PHP le colle tel quel plutot que de redessiner ses quatre chemins : une
    #: deuxieme geometrie ecrite dans un autre langage est une deuxieme geometrie a avoir
    #: tort, et celle-la aurait diverge sans que personne ne regarde.
    transparent = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
                   f"{mark_group(ACCENT)}</svg>")
    rasterise(transparent, ROOT / "site/resources/brand/mark-96.png", 96, 96)

    #: L'icone de serveur Discord, affichee en rond et souvent en 32 pixels dans une liste.
    rasterise(plate(512, 0.62, 0.5, relief=False, plate_fill=BG),
              BRAND / "discord-icon.png", 512, 512)


def build_ico() -> None:
    """Les trois tailles reunies dans un seul .ico, apres rasterisation."""
    TMP.mkdir(exist_ok=True)
    frames = [Image.open(TMP / f"ico-{s}.png").convert("RGBA") for s in (16, 32, 48)]
    frames[2].save(PUBLIC / "favicon.ico", format="ICO",
                   sizes=[(48, 48), (32, 32), (16, 16)])
    for f in frames:
        f.close()
    print("   site/public/favicon.ico  16+32+48")



# ------------------------------------------------------------------- les images partagees

#: Le visuel de fond, produit une fois par un modele et versionne tel quel. Il n'est pas
#: regenere a chaque passage : une sortie de modele n'est pas reproductible, et une marque
#: dont l'illustration change a chaque build n'est pas une marque.
BACKDROP = BRAND / "fond-usine.png"


def tritone(image: "Image.Image") -> "Image.Image":
    """Ramener une image quelconque dans les trois tons du site.

    Le modele a rendu une usine bleu marine et orange. Elle est juste de forme et fausse de
    couleur, et poser un accent ambre sur un fond marine donne deux jaunes qui se disputent.
    On lit donc la luminance seule, et on la rejoue sur la rampe fond -> panneau -> accent :
    le dessin reste, la palette part.

    La rampe est d'abord etiree sur la plage reellement occupee, et pas sur 0-255. Une
    image de nuit tient toute entiere dans le bas de l'echelle : mesure sur celle-ci, 99
    pour cent des pixels sont sous 79. Une rampe etalee sur toute l'echelle envoyait donc
    l'usine complete dans les deux tons les plus sombres, l'ambre n'etait jamais atteint, et
    le resultat ressemblait a du bruit de compression plutot qu'a une usine.
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

    #: La rampe est posee comme une palette plutot que pixel par pixel : une image d'un
    #: million de points traversee en Python coute une seconde et une deprecation Pillow,
    #: alors qu'une palette est exactement ce qu'une table de correspondance est.
    out = Image.frombytes("P", grey.size, grey.tobytes())
    out.putpalette([canal for couleur in ramp for canal in couleur])
    return out.convert("RGB")


def _plage(grey: "Image.Image", bas: float, haut: float) -> tuple[int, int]:
    """Les deux niveaux entre lesquels l'image vit vraiment, en ecartant les extremes.

    Prendre le minimum et le maximum bruts aurait suffi a un pixel isole pour decider de
    l'etirement de toute l'image.
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
    """Le fond etalonne, recadre au format demande puis assombri, en data-URI."""
    import base64
    from io import BytesIO

    graded = tritone(Image.open(BACKDROP).convert("RGB"))

    #: Recadrage par remplissage : on couvre la boite sans jamais deformer l'usine, dont la
    #: grille carree se verrait tordue au premier etirement.
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
    """La police du site, embarquee : le rendu ne doit dependre d'aucun reseau."""
    import base64

    return "data:font/woff2;base64," + base64.b64encode(FONT.read_bytes()).decode()


def social_html(width, height, *, lines, kicker, scale, darken):
    """La carte sociale, en HTML plutot qu'en SVG.

    Le SVG aurait demande de convertir chaque ligne en contours. Le HTML rend le texte avec
    la vraie police et les vrais reglages d'interlettrage, et c'est Chromium qui rasterise,
    donc exactement le moteur qui affiche deja le site.
    """
    logo = (BRAND / "logo.svg").read_text(encoding="utf-8")
    body = "".join("<span>%s</span>" % line for line in lines)
    px = lambda v: round(v * scale)
    return """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Forge"; src: url("%(font)s") format("woff2"); }
* { margin: 0; box-sizing: border-box; }
body { width: %(w)dpx; height: %(h)dpx; overflow: hidden;
  font-family: "Forge", sans-serif; color: %(ink)s; background: %(bg)s; }
.carte { position: relative; width: 100%%; height: 100%%; }
.fond { position: absolute; inset: 0; width: 100%%; height: 100%%; object-fit: cover; }
/* Un voile qui part du bord ou vit le texte. Sans lui, une machine ambre passant sous une
   lettre ambre fait disparaitre la lettre, et on ne le decouvre qu'une fois le lien
   partage. */
.voile { position: absolute; inset: 0;
  background: linear-gradient(100deg, %(bg)sfa 0%%, %(bg)sf0 40%%, %(bg)s99 62%%,
    %(bg)s3d 82%%, %(bg)s1a 100%%); }
.bord { position: absolute; inset: 0; border: %(edgew)dpx solid %(edge)s; }
.dedans { position: absolute; inset: 0; padding: %(pad)dpx; display: flex;
  flex-direction: column; justify-content: center; gap: %(gap)dpx; }
.logo img { height: %(logoh)dpx; display: block; }
h1 { font-size: %(h1)dpx; line-height: 1.18; font-weight: 400;
  display: flex; flex-direction: column; }
/* Chaque ligne du titre est une decision, pas un repli calcule par le navigateur : une
   ligne qui se coupe toute seule coupe au mauvais endroit, et personne ne le voit avant
   que le lien soit partage. */
h1 span { white-space: nowrap; }
h1 em { font-style: normal; color: %(accent)s; }
.regle { width: %(rulew)dpx; height: %(ruleh)dpx; background: %(accent)s; }
.kicker { color: %(dim)s; font-size: %(kick)dpx; letter-spacing: %(track).2fpx;
  text-transform: uppercase; }
.pied { position: absolute; right: %(pad)dpx; bottom: %(footb)dpx; color: %(dim)s;
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
<div class="pied">mindustryforge.com</div>
</div></body></html>""" % {
        "font": font_uri(), "w": width, "h": height, "ink": INK, "bg": BG, "edge": EDGE,
        "accent": ACCENT, "dim": DIM, "backdrop": backdrop_uri(width, height, darken),
        "logo": logo, "body": body, "kicker": kicker,
        "edgew": px(6), "pad": px(62), "gap": px(26), "logoh": px(46), "h1": px(58),
        "maxw": px(780), "rulew": px(72), "ruleh": px(4), "kick": px(21),
        "track": 2.4 * scale, "foot": px(22), "footb": px(50),
    }


def _jpeg(page, out: Path, width: int, height: int) -> None:
    """Photographier la page, puis ecrire en JPEG plutot qu'en PNG.

    Un PNG de cette carte pese 538 ko, parce que le fond d'usine est photographique et
    qu'aucune quantification ne le rattrape : sans tramage il reste a 280 ko, avec tramage
    le bruit ajoute annule le gain. Le meme visuel en JPEG de qualite 88 pese 69 ko, et le
    texte ambre sur fond sombre n'y montre aucun artefact visible.

    Ce n'est pas une coquetterie de poids : une image de partage est retelechargee par
    chaque service qui deplie le lien, a chaque fois qu'il le deplie.
    """
    from io import BytesIO

    shot = Image.open(BytesIO(page.screenshot())).convert("RGB")
    shot.save(out, format="JPEG", quality=88, optimize=True, progressive=True)
    print("  ", out.relative_to(ROOT), "%dx%d" % (width, height),
          "%.0f ko" % (out.stat().st_size / 1024))


def build_social() -> None:
    """Les images qu'on ne choisit pas de montrer : elles arrivent avec le lien."""
    from playwright.sync_api import sync_playwright

    #: Ici le texte porte ses accents, alors que le reste du site n'en met pas. C'est
    #: assume : la police les couvre toutes, verifie glyphe par glyphe, et « schematique »
    #: sans accent dans la vignette d'un lien partage sur Discord se lit comme un encodage
    #: casse. Une incoherence se rattrape, une premiere impression non.
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

        #: La banniere Discord, au format que le serveur affiche en tete de liste.
        page = browser.new_page(viewport={"width": 960, "height": 540})
        page.set_content(social_html(
            960, 540, scale=0.86, darken=0.20,
            lines=["Analyse ta sch\u00e9matique", "<em>avant de la poser.</em>"],
            kicker="Outil libre \u00b7 AGPL-3.0"))
        page.wait_for_timeout(350)
        _jpeg(page, BRAND / "discord-banniere.jpg", 960, 540)
        page.close()
        browser.close()


if __name__ == "__main__":
    font = TTFont(FONT)
    print("logotypes")
    build_logos(font)
    print("police pour le serveur")
    build_truetype()
    print("icones")
    build_icons()
    flush_raster()
    build_ico()
    print("images partagees")
    build_social()
