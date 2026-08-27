/**
 * Ce que le lecteur fait d'une chaine qui ne veut pas etre lue.
 *
 * Le parseur `.msch` a change de metier sans changer de code. Il lisait ce qu'un visiteur
 * venait de copier dans son propre jeu ; il lit maintenant quinze mille schematiques
 * ramenees de deux autres sites, dans le navigateur de qui ouvre une page et sous Node
 * quand le collecteur mesure. Une entree n'est plus maladroite, elle peut etre choisie.
 *
 * Chaque cas ici est un fichier fabrique pour faire mal, et ce qu'on exige est toujours la
 * meme chose : refuser vite, ou lire ce qui est lisible, mais jamais tourner sans fin ni
 * allouer sans borne. Les entrees sont construites a la main plutot que par
 * `schematic.js` : un fichier hostile ecrit par l'ecrivain qu'on teste ne serait pas
 * hostile.
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

test("un compte de tuiles a deux milliards ne fait pas deux milliards de tours", async () => {
  const { ms } = await timed(() => read(msch(body({ tileCount: 2147483647 }))));
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms pour un fichier de trente octets`);
});

test("le compte de tuiles annonce est rendu comme tronque, pas comme lu", async () => {
  const out = await read(msch(body({ tileCount: 2147483647 })));
  assert.equal(out.tiles.length, 0);
  assert.equal(out.truncated, 2147483647,
    "un rapport sur zero bloc doit dire qu'il en manque deux milliards");
});

/* Trois types de configuration lisent leur compte en entier signe et sautent un multiple.
   Un compte negatif fait donc reculer le curseur, ce qui est exactement ce qu'il faut pour
   fabriquer une boucle qui ne progresse pas. Elle s'arrete parce qu'un curseur devenu
   negatif fait echouer la lecture suivante, et ce test tient cette raison-la. */
for (const [type, mult] of [[6, 4], [18, 8], [21, 4]]) {
  test(`un compte negatif de type ${type} ne fait pas boucler la lecture`, async () => {
    const tile = new Writer().u8(0).i32(0).u8(type).i16(-2).u8(0).done();
    const { ms } = await timed(() =>
      read(msch(body({ tileCount: 2147483647, payload: tile }))));
    assert.ok(ms < 1000, `${ms.toFixed(0)} ms, saut de ${mult * -2} octets par tour`);
  });
}

test("une configuration imbriquee cent mille fois ne casse pas la lecture", async () => {
  /* Le type 22 se lit lui-meme, sur une profondeur que le fichier choisit. La pile finit
     par ceder, et ce qui compte est que la page rende un rapport tronque plutot qu'une
     erreur non rattrapee. */
  const w = new Writer().u8(0).i32(0);
  for (let i = 0; i < 100000; i++) w.u8(22).i32(1);
  const out = await read(msch(body({ tileCount: 1, payload: w.u8(0).u8(0).done() })));
  assert.equal(out.truncated, 1);
});

test("un byte[] qui annonce deux giga-octets n'en alloue aucun", async () => {
  const tile = new Writer().u8(0).i32(0).u8(14).i32(2147483647).done();
  const { ms } = await timed(() => read(msch(body({ tileCount: 1, payload: tile }))));
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
});

test("une chaine qui deborde du fichier est refusee, pas lue a cote", async () => {
  const w = new Writer().i16(4).i16(4).u8(1).i16(32000).bytes(Buffer.from("court"));
  const { refused } = await timed(() => read(msch(w.done())));
  assert.match(refused?.message ?? "", /se termine au milieu/);
});

test("une bombe de decompression est refusee avant d'etre allouee", async () => {
  /* Huit cent mille octets qui se dilatent en huit cents millions. Avant la borne, la
     lecture les prenait tous et le processus montait a un giga-octet et sept ; le collecteur
     en mesure cinquante a la fois, sur la machine qui porte aussi la facturation. */
  const bomb = new Uint8Array(Buffer.concat([
    Buffer.from([0x6d, 0x73, 0x63, 0x68, 1]),
    deflateSync(Buffer.alloc(800 * 1024 * 1024)),
  ]));
  assert.ok(bomb.length < 1024 * 1024, "l'entree doit rester petite, sinon on teste autre chose");

  const before = process.memoryUsage().rss;
  const { refused, ms } = await timed(() => read(bomb));

  assert.match(refused?.message ?? "", /se dilate au-dela/);
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms`);
  assert.ok(process.memoryUsage().rss - before < 400 * 1024 * 1024,
    "la borne doit couper avant que la memoire soit prise");
});

test("une configuration de processeur qui se dilate est rendue illisible", async () => {
  /* Le meme piege un etage plus bas, et il survit a la borne du dessus : une schematique
     bornee peut toujours porter une configuration qui, elle, se dilate sans fin. Mesuree
     avant la borne, huit cent mille octets de configuration prenaient deux gigaoctets et
     demi. Rendue nulle plutot que levee, parce que c'est le contrat de ce lecteur : un
     processeur illisible n'empeche pas de lire la schematique autour. */
  const bomb = new Uint8Array(deflateSync(Buffer.alloc(800 * 1024 * 1024)));
  const before = process.memoryUsage().rss;
  const { refused, ms } = await timed(async () => {
    assert.equal(await readProgram(bomb), null);
  });

  assert.equal(refused, null, "elle ne doit pas remonter en exception");
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms`);
  assert.ok(process.memoryUsage().rss - before < 400 * 1024 * 1024,
    "la borne doit couper avant que la memoire soit prise");
});

test("un programme au maximum de ce que le jeu accepte passe toujours", async () => {
  const code = 'print "x"\n'.repeat(10000);
  const links = Array.from({ length: 500 },
    (whole, i) => ({ name: `cell${i}`, dx: i % 60, dy: 0 }));

  const back = await readProgram(await writeProgram({ code, links }));
  assert.equal(back.code, code);
  assert.equal(back.links.length, 500);
});

test("ce que le jeu peut ecrire passe toujours", async () => {
  /* La borne vient des limites du jeu, donc elle ne doit refuser aucun fichier legitime.
     Cinquante mega-octets restent en dessous, et c'est deja bien plus qu'aucune schematique
     reelle. */
  const large = new Uint8Array(Buffer.concat([
    Buffer.from([0x6d, 0x73, 0x63, 0x68, 1]),
    deflateSync(Buffer.alloc(50 * 1024 * 1024)),
  ]));
  const out = await read(large);
  assert.equal(out.tiles.length, 0, "illisible mais lu, et surtout pas refuse pour sa taille");
});
