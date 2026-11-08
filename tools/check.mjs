// node tools/check.mjs: every library file parses and the game folder fits Abstracts' upload limits.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { parseDance } from '../artifacts/copycat/js/dance.js';
import { parsePack } from '../artifacts/copycat/js/music.js';

const dir = new URL('../artifacts/copycat/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(dir);
const total = files.reduce((n, f) => n + statSync(f).size, 0);
for (const f of files) assert.ok(statSync(f).size <= 5 * 1024 * 1024, `${f} is over 5 MB`);
assert.ok(files.length <= 95, `${files.length} files; Abstracts allows 100 with the cover and manifest`);
assert.ok(total <= 9.5 * 1024 * 1024, `${(total / 1048576).toFixed(1)} MB; Abstracts allows 10 MB`);
const index = JSON.parse(readFileSync(join(dir, 'library/dances/index.json'), 'utf8')).dances;
for (const d of index) {
  const dance = parseDance(readFileSync(join(dir, `library/dances/${d.id}.json`), 'utf8'));
  assert.equal(dance.id, d.id);
  assert.ok(dance.song.url, `${d.id} has no song url`);
}
const pack = parsePack(JSON.parse(readFileSync(join(dir, 'library/music.json'), 'utf8')));
assert.ok(pack && pack.tracks.every((t) => /^CC (BY|BY-SA) |^CC0|^Public domain/.test(t.license)), 'every starter track needs a CC BY, BY-SA or CC0 license');
console.log(`ok: ${files.length} files, ${(total / 1024).toFixed(0)} KB, ${index.length} dances, ${pack.tracks.length} tracks`);
