/**
 * What the reader does with a string that does not want to be read.
 *
 * The `.msch` parser changed jobs without changing code. It used to read what a visitor
 * had just copied out of their own game; it now reads fifteen thousand schematics pulled
 * in from two other sites, in the browser of whoever opens a page and under Node when the
 * collector measures. An input is no longer merely clumsy, it can be chosen.
 *
 * Every case here is a file built to hurt, and what is demanded is always the same thing:
 * refuse fast, or read what is readable, but never loop forever or allocate without a
 * bound. The inputs are built by hand rather than through `schematic.js`: a hostile file
 * written by the very writer under test would not be hostile.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import { read } from "../../site/public/forge/schematic.js";
import { readProgram, writeProgram } from "../../site/public/forge/logic.js";

class Writer {
  constructor() { this.parts = []; }
  u8(v) { this.parts.push(Buffer.from([v & 0xFF])); return this; }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v); this.parts.push(b); return this; }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v); this.parts.push(b); return this; }
  text(s) { const b = Buffer.from(s, "utf8"); this.i16(b.length); this.parts.push(b); return this; }
  bytes(b) { this.parts.push(Buffer.from(b)); return this; }
  done() { return Buffer.concat(this.parts); }
}

const msch = (body) =>
  new Uint8Array(Buffer.concat([Buffer.from([0x6d, 0x73, 0x63, 0x68, 1]), deflateSync(body)]));

/** A body with a tile count and a payload of our choosing. */
function body({ tileCount, payload = Buffer.alloc(0) }) {
  return new Writer().i16(4).i16(4).u8(0).u8(1).text("router").i32(tileCount)
    .bytes(payload).done();
}

/** How long a call took, so a hang fails as a number rather than as a stuck run. */
async function timed(work) {
  const started = process.hrtime.bigint();
  let refused = null;
  try { await work(); } catch (error) { refused = error; }
  return { ms: Number(process.hrtime.bigint() - started) / 1e6, refused };
}

test("a tile count of two billion does not make two billion passes", async () => {
  const { ms } = await timed(() => read(msch(body({ tileCount: 2147483647 }))));
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms for a thirty-byte file`);
});

test("an announced tile count is reported as truncated, not as read", async () => {
  const out = await read(msch(body({ tileCount: 2147483647 })));
  assert.equal(out.tiles.length, 0);
  assert.equal(out.truncated, 2147483647,
    "a report of zero blocks has to say two billion are missing");
});

/* Three configuration types read their count as a signed integer and skip a multiple of
   it. A negative count therefore walks the cursor backward, which is exactly what it takes
   to build a loop that never progresses. It stops because a cursor gone negative fails the
   next read, and this test holds onto that reason. */
for (const [type, mult] of [[6, 4], [18, 8], [21, 4]]) {
  test(`a negative count of type ${type} does not loop the read`, async () => {
    const tile = new Writer().u8(0).i32(0).u8(type).i16(-2).u8(0).done();
    const { ms } = await timed(() =>
      read(msch(body({ tileCount: 2147483647, payload: tile }))));
    assert.ok(ms < 1000, `${ms.toFixed(0)} ms, a jump of ${mult * -2} bytes a pass`);
  });
}

test("a configuration nested a hundred thousand times deep does not break the read", async () => {
  /* Type 22 reads itself, to a depth the file chooses. The stack eventually gives way, and
     what matters is that the page renders a truncated report rather than an uncaught
     error. */
  const w = new Writer().u8(0).i32(0);
  for (let i = 0; i < 100000; i++) w.u8(22).i32(1);
  const out = await read(msch(body({ tileCount: 1, payload: w.u8(0).u8(0).done() })));
  assert.equal(out.truncated, 1);
});

test("a byte[] that announces two gigabytes allocates none of them", async () => {
  const tile = new Writer().u8(0).i32(0).u8(14).i32(2147483647).done();
  const { ms } = await timed(() => read(msch(body({ tileCount: 1, payload: tile }))));
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
});

test("a string that overruns the file is refused, not read past its edge", async () => {
  const w = new Writer().i16(4).i16(4).u8(1).i16(32000).bytes(Buffer.from("court"));
  const { refused } = await timed(() => read(msch(w.done())));
  assert.match(refused?.message ?? "", /se termine au milieu/);
});

test("a decompression bomb is refused before it is allocated", async () => {
  /* Eight hundred thousand bytes that expand into eight hundred million. Before the bound,
     the read took all of it and the process climbed to a gigabyte and seven; the collector
     measures fifty of these at once, on the machine that also carries billing. */
  const bomb = new Uint8Array(Buffer.concat([
    Buffer.from([0x6d, 0x73, 0x63, 0x68, 1]),
    deflateSync(Buffer.alloc(800 * 1024 * 1024)),
  ]));
  assert.ok(bomb.length < 1024 * 1024, "the input has to stay small, otherwise this is testing something else");

  const before = process.memoryUsage().rss;
  const { refused, ms } = await timed(() => read(bomb));

  assert.match(refused?.message ?? "", /se dilate au-dela/);
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms`);
  assert.ok(process.memoryUsage().rss - before < 400 * 1024 * 1024,
    "the bound has to cut it off before the memory is taken");
});

test("a processor configuration that expands is rendered unreadable", async () => {
  /* The same trap one floor down, and it survives the bound above: a bounded schematic can
     still carry a configuration that itself expands without end. Measured before the
     bound, eight hundred thousand bytes of configuration took two and a half gigabytes.
     Rendered as null rather than thrown, because that is this reader's contract: an
     unreadable processor does not stop the schematic around it from being read. */
  const bomb = new Uint8Array(deflateSync(Buffer.alloc(800 * 1024 * 1024)));
  const before = process.memoryUsage().rss;
  const { refused, ms } = await timed(async () => {
    assert.equal(await readProgram(bomb), null);
  });

  assert.equal(refused, null, "it must not surface as an exception");
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms`);
  assert.ok(process.memoryUsage().rss - before < 400 * 1024 * 1024,
    "the bound has to cut it off before the memory is taken");
});

test("a program at the maximum the game accepts always passes", async () => {
  const code = 'print "x"\n'.repeat(10000);
  const links = Array.from({ length: 500 },
    (whole, i) => ({ name: `cell${i}`, dx: i % 60, dy: 0 }));

  const back = await readProgram(await writeProgram({ code, links }));
  assert.equal(back.code, code);
  assert.equal(back.links.length, 500);
});

test("whatever the game can write always passes", async () => {
  /* The bound comes from the game's own limits, so it must not refuse any legitimate file.
     Fifty megabytes stays under it, and that is already far more than any real
     schematic. */
  const large = new Uint8Array(Buffer.concat([
    Buffer.from([0x6d, 0x73, 0x63, 0x68, 1]),
    deflateSync(Buffer.alloc(50 * 1024 * 1024)),
  ]));
  const out = await read(large);
  assert.equal(out.tiles.length, 0, "unreadable but read, and above all not refused for its size");
});
