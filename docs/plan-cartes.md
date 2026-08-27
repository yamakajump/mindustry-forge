# Maps: what they cost before anybody writes a line

Sized 28 August 2026, against the real format and the real catalogue. Three questions were
asked and three things were measured; the answers changed the shape of the work twice.

## 1. Is it a whole new reader?

**No, and the reason is a length prefix.**

A `.msav` is not a `.msch` with different contents. A schematic is `msch` + a version byte +
a deflate stream; a save is **zlib from byte zero**, and the magic is inside:

```
789c ...                          the file, as served
4d53 4156 0000 000d ...           inflated: "MSAV", then int version 13
```

What makes this cheap is `SaveFileReader.writeChunk`, read from Mindustry v159.7 rather
than from a wiki, as this repository requires:

```java
int length = dout.size();
output.writeInt(length);
output.write(dout.getBytes(), 0, length);
```

**Every region and every entity carries its own length.** So a reader can take the three
things a catalogue needs and step over the rest without understanding a byte of it:

| region | needed | why |
|---|---|---|
| `meta` | **yes** | name, author, size, the rules the map was built under |
| `patches` | no | skippable by length |
| `content` | **yes** | see below, and it is the one that bites |
| `map` | **yes** | the terrain, run-length encoded, two layers |
| `entities` | no | skippable by length, and this is where `TypeIO` would have been |
| `markers`, `custom` | no | skippable by length |

The map region itself is plain. Floors and overlays come as `(floorID, overlayID, count)`
triples; blocks as `(blockID, flags)` with the same run-length trick, and a per-tile entity
chunk only when the flag says so - which is exactly the chunk we skip.

**The one thing that must not be skipped is `content`.** A save stores block ids, and those
ids are not stable across versions: the content header maps the names the save was written
with onto the ids the current game uses. Skipping it does not fail, it silently reads
somebody's map as a different map. That is the failure mode this repository is built around
avoiding, and it is invisible in every test that does not compare against the game.

What transfers from what we already have: the inflate handling and the byte-walking
discipline of `schematic.js`. What does not transfer: nothing about `.msch`'s own layout.
What we do not need at all: `TypeIO`, unit serialisation, the rules parser.

## 2. How much is there?

Measured on twelve real maps pulled from the live catalogue:

| | |
|---|---|
| maps published | **8 249** |
| average, compressed | 42 KB |
| average, inflated | 324 KB |
| largest of the twelve, inflated | 1.1 MB |
| **the whole catalogue, compressed** | **≈ 347 MB** |

Against the schematics: 15 533 of them exported to 67 MB. **Maps are five times the volume
for half the count**, and one of the twelve inflates to more than a megabyte on its own.

That kills the obvious plan before it is written. A schematic lives in a `longText` column
because a schematic is a few kilobytes of base64; 347 MB base64-encoded is around 460 MB in
one table, on a box that also serves a billing panel. Map files belong on disk with a path
in the row, and that decision has to be made first because it is the one that is expensive
to change later.

## 3. Does `render.js` draw the preview?

**No, and it should not be asked to.**

The sprites exist: the atlas already carries 17 of the 20 base floors and all 13 ores,
because a schematic can stand on painted ground. But a schematic is at most 64x64, which is
4 096 tiles, and the map measured above is **712x712, which is 507 000**. Drawing half a
million sprites to make a thumbnail is the wrong shape of answer.

The game's own answer is one pixel per tile taken from the floor's `mapColor`, which is
what `MapIO.generatePreview` does. Ours cannot do that yet:

```
environment blocks in blocks.json : 102
of those carrying a map colour    : 0
```

So the preview needs one line in `tools/build_catalogue.py` and nothing else. That is the
same answer as the colour registry needed for stripping tags out of names, and the two
should be dumped in the same pass.

## What this says about the order

**Read, then show, then maybe edit.** Corentin named the editor, and the editor is the
third step rather than the first, for a reason that is a measurement and not an opinion:
the existing editor handles 4 096 tiles, and a map is 124 times that. A viewport, tiling
and a level of detail are a different rendering problem, not the current editor scaled up.
Whereas reading a map is a few hundred lines because the format lets us skip what is hard,
and showing one is a dumper line away.

The first slice worth doing, in order:

1. `mapColor` and the colour registry into the dumper, one pass, one PR. Both are blocked
   on the bench and both unblock something else.
2. A `.msav` reader for `meta`, `content` and the map region, skipping the rest. Held
   against the game the way `.msch` is: a map read here and a map read by the server have
   to agree on the terrain, or the reader is wrong.
3. A preview from `mapColor`, and only then a listing.
4. Collection, and not before the three above. Fifteen thousand schematics were collected
   ahead of the thing that made them searchable and the catalogue sat at 2% coverage for a
   day. Eight thousand maps we cannot open would be that mistake, made again, at five times
   the disk.

An editor is not on this list, and it should be argued for on its own once a map can be
read and drawn, because until then nobody can say what editing one costs.
