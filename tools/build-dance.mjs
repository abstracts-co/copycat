// node tools/build-dance.mjs --video dancer.webm --title "Nae Nae" --song "Funk party 1" --loops 3 --credit "El Martial|https://commons.wikimedia.org/wiki/File:X.webm|CC BY 3.0" --out out/nae-nae
// Builds a Copycat dance folder from a video of one dancer, frame by frame at 30 fps: the dance video, the ghost track
// (brightness | person mask, the app's format) and pose.json, with the same MediaPipe model and 9:16 crop the app uses.
// Needs ffmpeg and Playwright's Chromium (npx playwright install chromium). Only use videos you may share: CC BY, CC BY-SA, CC0 or your own.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const root = fileURLToPath(new URL('..', import.meta.url));
const video = resolve(arg('video')), title = arg('title', 'Untitled dance'), songTitle = arg('song'), loops = Number(arg('loops', 1)), out = resolve(arg('out', `out/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`));
const [creditName, creditUrl, creditLicense] = (arg('credit', '') || '||').split('|');
const tracks = JSON.parse(readFileSync(join(root, 'artifacts/copycat/library/music.json'), 'utf8')).tracks;
const song = tracks.find((t) => t.title === songTitle);
if (!video || !song) { console.error('Need --video and a --song from artifacts/copycat/library/music.json'); process.exit(1); }

const tmp = join(root, '.scratch', `build-${Date.now()}`);
mkdirSync(join(tmp, 'color'), { recursive: true }); mkdirSync(join(tmp, 'ghost'), { recursive: true }); mkdirSync(out, { recursive: true });
// Headless Chromium hands back stale frames after seeking a <video>, so ffmpeg decodes every frame at 30 fps, 9:16 centre crop.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=540:960,fps=30", '-q:v', '2', join(tmp, 'color/%05d.jpg')]);
const count = readdirSync(join(tmp, 'color')).length;
const port = 8811, server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const page = `<!doctype html><body><script type="module">
const CDN='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35', MODEL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const INDEX=[0,11,12,13,14,15,16,19,20,23,24,25,26,27,28];
const { FilesetResolver, PoseLandmarker } = await import(CDN + '/vision_bundle.mjs');
const lm = await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(CDN + '/wasm'), { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: true });
const c = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const work = c(288, 512), ghost = c(360, 320), mask = c(288, 512);
const wc = work.getContext('2d'), gc = ghost.getContext('2d'), mc = mask.getContext('2d'), md = mc.createImageData(288, 512);
window.build = async (base, count, loops) => {
  const n = count * loops, poses = [];
  for (let i = 0; i < n; i++) {
    const img = new Image(); img.src = base + String((i % count) + 1).padStart(5, '0') + '.jpg'; await img.decode();
    wc.drawImage(img, 0, 0, 288, 512);
    let pose = null;
    lm.detectForVideo(work, i * 33 + 1, (r) => {
      const l = r.landmarks?.[0]; if (l) pose = INDEX.flatMap((m) => { const p = l[m], inside = p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02; return [p.x, p.y, inside ? (p.visibility ?? 1) : 0]; });
      const m = r.segmentationMasks?.[0]; if (m) { const f = m.getAsUint8Array(); for (let k = 0; k < f.length; k++) { md.data[k * 4] = md.data[k * 4 + 1] = md.data[k * 4 + 2] = 255; md.data[k * 4 + 3] = f[k]; } mc.putImageData(md, 0, 0); }
    });
    gc.fillStyle = '#000'; gc.fillRect(0, 0, 360, 320); gc.filter = 'grayscale(1)'; gc.drawImage(work, 0, 0, 180, 320); gc.filter = 'none'; gc.drawImage(mask, 180, 0, 180, 320);
    poses.push(pose);
    await window.save(i, ghost.toDataURL('image/jpeg', 0.92));
  }
  return { poses, duration: n / 30 };
};
window.ready = true;
</script>`;
writeFileSync(join(tmp, 'build.html'), page);
const browser = await chromium.launch({ headless: true });
const p = await browser.newPage();
p.on('pageerror', (e) => console.error('page:', e.message));
await p.exposeFunction('save', (i, ghost) => {
  const name = `${String(i).padStart(5, '0')}.jpg`;
  writeFileSync(join(tmp, 'ghost', name), Buffer.from(ghost.split(',')[1], 'base64'));
  if (i % 60 === 0) process.stdout.write(`frame ${i}\n`);
});
const rel = tmp.slice(root.length).split('/').filter(Boolean).join('/');
await p.goto(`http://localhost:${port}/${rel}/build.html`);
await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const { poses, duration } = await p.evaluate((a) => window.build(...a), [`http://localhost:${port}/${rel}/color/`, count, loops]);
await browser.close(); server.kill();

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
ff(['-stream_loop', String(loops - 1), '-framerate', '30', '-i', join(tmp, 'color/%05d.jpg'), '-frames:v', String(poses.length), '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p', '-b:v', '1100k', '-maxrate', '1300k', '-bufsize', '2600k', '-movflags', '+faststart', join(out, 'video.mp4')]);
ff(['-framerate', '30', '-i', join(tmp, 'ghost/%05d.jpg'), '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p', '-b:v', '260k', '-movflags', '+faststart', join(out, 'ghost.mp4')]);
ff(['-i', join(tmp, `color/${String(Math.floor(count / 3) + 1).padStart(5, '0')}.jpg`), '-quality', '86', join(out, 'preview.webp')]);

const frames = [];
for (let i = 0; i < Math.round(duration * 20); i++) {
  const f = i * 1.5, a = poses[Math.floor(f)], b = poses[Math.min(poses.length - 1, Math.ceil(f))], w = f - Math.floor(f);
  frames.push(a && b ? a.map((v, k) => Math.round((v + (b[k] - v) * w) * (k % 3 === 2 ? 100 : 1000)) / (k % 3 === 2 ? 100 : 1000)) : (a ?? b ?? new Array(45).fill(0)));
}
const JOINTS = ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftIndex', 'rightIndex', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
writeFileSync(join(out, 'pose.json'), JSON.stringify({ rate: 20, space: 'stage-9x16', joints: JOINTS, frames }));
const credit = creditName ? { name: creditName, url: creditUrl, license: creditLicense } : undefined;
const start = song.segment ? song.segment[0] : 0;
writeFileSync(join(out, 'dance.json'), JSON.stringify({ format: 'copycat/dance@2', title, hashtags: ['starter'], mode: 'upper', privacy: false, created: new Date().toISOString(), song, clip: { start, length: Math.floor(duration * 10) / 10, offset: 0 }, files: { video: 'video.mp4', ghost: 'ghost.mp4', pose: 'pose.json', cover: 'preview.webp' }, credit }));
const songCredit = `“${song.title}” by ${song.artist} (${song.license})`;
writeFileSync(join(out, 'artifact.json'), `${JSON.stringify({ title, description: `A Copycat dance to ${songCredit}`, kind: 'web', entry: 'index.html', poster: 'preview.webp', category: 'dances', permissions: ['camera', 'microphone'] }, null, 2)}\n`);
writeFileSync(join(out, 'content.md'), `# ${title}\n\nA Copycat dance to ${songCredit}.${credit ? `\n\nDancer: ${credit.name}, from ${credit.url} (${credit.license}).` : ''}\n\nSong: ${song.page}\n\nCopy the ghost with your camera on a/copycat.\n`);
const APP = 'https://abstracts-co.github.io/copycat/artifacts/copycat/';
writeFileSync(join(out, 'index.html'), `<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="copycat-dance" content="dance.json">\n<title>${title}</title>\n<link rel="stylesheet" href="${APP}css/app.css">\n<body>\n<div id="app"></div>\n<script type="module" src="${APP}js/app.js"></script>\n</body>\n</html>\n`);
rmSync(tmp, { recursive: true, force: true });
const seen = frames.filter((f) => f[5] > 0.35).length / frames.length;
console.log(`built ${out}: ${duration.toFixed(1)} s, shoulders tracked in ${Math.round(seen * 100)}% of frames`);
