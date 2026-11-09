// node tools/check.mjs: every artifact folder fits Abstracts' upload limits, and every dance and music pack parses.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { parseDance, parsePose, cleanSong } from '../artifacts/copycat/js/data/format.js';

const root = new URL('../artifacts/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let dances = 0;
for (const id of readdirSync(root).filter((f) => statSync(join(root, f)).isDirectory())) {
  const dir = join(root, id), files = walk(dir), total = files.reduce((n, f) => n + statSync(f).size, 0);
  for (const f of files) assert.ok(statSync(f).size <= 5 * 1024 * 1024, `${f} is over 5 MB`);
  assert.ok(files.length <= 95, `${id}: ${files.length} files; Abstracts allows 100 with the cover and manifest`);
  assert.ok(total <= 9.5 * 1024 * 1024, `${id}: ${(total / 1048576).toFixed(1)} MB; Abstracts allows 10 MB`);
  const manifest = JSON.parse(readFileSync(join(dir, 'artifact.json'), 'utf8'));
  assert.ok(manifest.title && manifest.entry && existsSync(join(dir, manifest.entry)), `${id}: artifact.json needs a title and an entry that exists`);
  if (existsSync(join(dir, 'dance.json'))) {
    const d = parseDance(readFileSync(join(dir, 'dance.json'), 'utf8'));
    for (const f of Object.values(d.files)) assert.ok(existsSync(join(dir, f)), `${id}: missing ${f}`);
    const pose = parsePose(JSON.parse(readFileSync(join(dir, d.files.pose), 'utf8')));
    assert.ok(pose.length >= d.clip.length - 1, `${id}: pose is shorter than the clip`);
    assert.ok(/^CC (BY|BY-SA) |^CC0|^Public domain/.test(d.song.license) || ['file', 'upload', 'youtube', 'apple'].includes(d.song.source), `${id}: the song needs a license everyone may dance to`);
    if (d.song.file) assert.ok(existsSync(join(dir, d.song.file)), `${id}: missing ${d.song.file}`);
    dances++;
  }
}
const pack = JSON.parse(readFileSync(join(root, 'copycat/library/music.json'), 'utf8'));
assert.ok(pack.tracks.every((t) => cleanSong(t) && /^CC (BY|BY-SA) |^CC0|^Public domain/.test(t.license)), 'every starter track needs a CC BY, BY-SA or CC0 license');
console.log(`ok: ${dances} dances, ${pack.tracks.length} starter tracks, every folder within upload limits`);
