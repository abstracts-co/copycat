// node tools/serve.mjs [port]: serves this repository with CORS, the way Abstracts serves artifact files.
// Add ?sandbox to a page URL to also get Abstracts' sandbox header; tools/preview.html frames the game like the About column.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)), port = Number(process.argv[2] ?? 8800);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.mp3': 'audio/mpeg' };
const SANDBOX = 'sandbox allow-scripts allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads';
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  if (path === '' || path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    const headers = { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (url.searchParams.has('sandbox')) headers['Content-Security-Policy'] = SANDBOX;
    res.writeHead(200, headers); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`http://localhost:${port}/artifacts/copycat/  (camera game)\nhttp://localhost:${port}/tools/preview.html  (as Abstracts shows it)`));
