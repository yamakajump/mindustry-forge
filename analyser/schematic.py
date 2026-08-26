"""Write a design in the format the game itself reads.

A design that cannot leave this repository is a result nobody can use. Mindustry already
has a way to move a build between players: the `.msch` schematic, shared as a base64
string that the game pastes straight from the clipboard. Players have traded them in
Discord for years. So the forge does not invent a format, it writes that one.

The layout below is not guessed. It is taken from `Schematics.write` and `TypeIO`
in Mindustry v159.7, the version this repository pins everywhere else:

    'm' 's' 'c' 'h'                     magic, four bytes
    version                             one byte, currently 1
    --- everything past here is deflate compressed ---
    short width, short height
    byte tagCount,   then writeUTF key, writeUTF value, per tag
    byte paletteSize, then writeUTF blockName, per entry
    int tileCount
    per tile: byte paletteIndex, int packedPosition, config, byte rotation

`writeUTF` is a big-endian two byte length followed by the bytes. A null config is a
single zero byte, which is every block a layout here can hold: none of them are
configured. A position is packed as `(x << 16) | (y & 0xFFFF)`, which is why a schematic
wider than a signed short would corrupt rather than fail, and why the writer refuses one.
"""

from __future__ import annotations

import base64
import io
import struct
import zlib

HEADER = b"msch"
VERSION = 1

#: A position is two signed shorts packed into an int, so this is the hard ceiling.
MAX_SIDE = 32767

#: Type id for a null object in TypeIO. Every block a layout holds is unconfigured.
CONFIG_NULL = b"\x00"

def size_of(block: str) -> int:
    """How many tiles a side a block covers.

    Asked of the registry the game itself printed, not of a table kept here. There was a
    table here, listing eight blocks by hand, and it was the same mistake this repository
    is built to avoid: it covered the blocks somebody happened to use and silently called
    everything else one tile wide.

    It matters for the declared width and height, since a schematic stores only a block's
    anchor tile. A design whose rightmost block is a two-wide drill overflows the box its
    own coordinates suggest, and used to be declared one short: a 1x7 schematic holding a
    2x2 drill, which is not a shape.
    """
    from analyser.blocks import catalogue

    return catalogue().size_of(block)


def anchor_offset(size: int) -> int:
    """Mindustry's `sizeOffset`: where a block sits relative to its stored tile.

    `-(size - 1) / 2` in Java, which truncates toward zero rather than flooring, so the
    division is written the same way here. An even-sized block puts its corner on the
    tile; an odd-sized one straddles it.
    """
    return int(-(size - 1) / 2)


def _utf(text: str) -> bytes:
    """Java's writeUTF: a two byte length, then the bytes.

    Identical to UTF-8 across the range block names and English descriptions occupy.
    Java's own encoding differs for NUL and for characters outside the basic plane, so
    those are refused rather than written wrong and discovered by a player.
    """
    encoded = text.encode("utf-8")
    if len(encoded) > 0xFFFF:
        raise ValueError(f"text of {len(encoded)} bytes is too long for a UTF field")
    if b"\x00" in encoded or any(ord(c) > 0xFFFF for c in text):
        raise ValueError("text contains a character Java encodes differently")
    return struct.pack(">H", len(encoded)) + encoded


def pack_point(x: int, y: int) -> int:
    """`Point2.pack`, verbatim: the upper short is x, the lower short is y."""
    return ((x & 0xFFFF) << 16) | (y & 0xFFFF)


def unpack_point(packed: int) -> tuple[int, int]:
    return (packed >> 16) & 0xFFFF, packed & 0xFFFF


def cropped(cells) -> tuple[int, int, int, int, list]:
    """The design's own bounding box, and its cells moved into it.

    A design occupies a corner of a work area that is mostly empty, and a schematic
    carrying that emptiness would paste as a rectangle of nothing with a factory in one
    corner. What a player wants is the build, so the box is tightened onto it.
    """
    cells = list(cells)
    if not cells:
        return 0, 0, 0, 0, []

    # Measured on what each block covers, not on where its anchor tile happens to sit.
    spans = []
    for x, y, block, _ in cells:
        size = size_of(block)
        offset = anchor_offset(size)
        spans.append((x + offset, y + offset, size))

    left = min(x for x, _, _ in spans)
    bottom = min(y for _, y, _ in spans)
    right = max(x + size - 1 for x, _, size in spans)
    top = max(y + size - 1 for _, y, size in spans)

    moved = [(x - left, y - bottom, block, rotation) for x, y, block, rotation in cells]
    return left, bottom, right - left + 1, top - bottom + 1, moved


def write(tiles, name: str = "forge", description: str = "") -> bytes:
    """Serialise `(x, y, block, rotation)` tiles as `.msch` bytes."""
    _, _, width, height, cells = cropped(tiles)

    if not cells:
        raise ValueError("an empty design has nothing to write")
    if width > MAX_SIDE or height > MAX_SIDE:
        raise ValueError(f"a {width}x{height} schematic cannot be packed into a position")

    palette: list[str] = []
    for _, _, block, _ in cells:
        if block not in palette:
            palette.append(block)
    if len(palette) > 0xFF:
        raise ValueError(f"{len(palette)} distinct blocks will not fit a one byte palette")

    tags = {"name": name}
    if description:
        tags["description"] = description

    body = io.BytesIO()
    body.write(struct.pack(">hh", width, height))

    body.write(struct.pack(">B", len(tags)))
    for key, value in tags.items():
        body.write(_utf(key))
        body.write(_utf(value))

    body.write(struct.pack(">B", len(palette)))
    for block in palette:
        body.write(_utf(block))

    body.write(struct.pack(">i", len(cells)))
    for x, y, block, rotation in cells:
        body.write(struct.pack(">B", palette.index(block)))
        body.write(struct.pack(">i", pack_point(x, y)))
        body.write(CONFIG_NULL)
        body.write(struct.pack(">B", rotation & 0xFF))

    return HEADER + bytes([VERSION]) + zlib.compress(body.getvalue())


def to_base64(tiles, name: str = "forge", description: str = "") -> str:
    """The string a player pastes into the game. This is the deliverable."""
    return base64.b64encode(write(tiles, name, description)).decode("ascii")


def read(payload: bytes) -> dict:
    """Parse `.msch` bytes back.

    Here so that what the writer produces can be checked against what it meant, rather
    than against nothing. A format written blind and never read back is a format that is
    wrong in a way only a player discovers.
    """
    if payload[:4] != HEADER:
        raise ValueError(f"not a schematic: header is {payload[:4]!r}")
    version = payload[4]
    if version > VERSION:
        raise ValueError(f"schematic version {version} is newer than {VERSION}")

    stream = io.BytesIO(zlib.decompress(payload[5:]))

    def take(count: int) -> bytes:
        chunk = stream.read(count)
        if len(chunk) != count:
            raise ValueError("schematic ends in the middle of a field")
        return chunk

    def text() -> str:
        (length,) = struct.unpack(">H", take(2))
        return take(length).decode("utf-8")

    width, height = struct.unpack(">hh", take(4))
    tags = {}
    for _ in range(take(1)[0]):
        key = text()
        tags[key] = text()

    palette = [text() for _ in range(take(1)[0])]

    (count,) = struct.unpack(">i", take(4))
    tiles = []
    for _ in range(count):
        index = take(1)[0]
        (packed,) = struct.unpack(">i", take(4))
        config = take(1)[0]
        if config != 0:
            raise ValueError(f"tile carries a configuration of type {config}")
        rotation = take(1)[0]
        x, y = unpack_point(packed)
        tiles.append((x, y, palette[index], rotation))

    return {"width": width, "height": height, "tags": tags,
            "palette": palette, "tiles": tiles}


def from_base64(text: str) -> dict:
    return read(base64.b64decode(text))
