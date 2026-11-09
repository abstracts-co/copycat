// node tools/room-server.mjs [port]: a local stand-in for abstracts.co rooms (docs/plans/artifact-platform.md, section 3),
// for testing parties with tools/host.html. The token is just the username. Needs `npm i --no-save ws`.
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] ?? 8812), rooms = new Map();
const wss = new WebSocketServer({ port });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost'), user = url.searchParams.get('token'), key = url.pathname;
  if (!user || !key.startsWith('/rooms/')) return ws.close(4002, 'token');
  const room = rooms.get(key) ?? { sockets: new Map(), state: {} };
  rooms.set(key, room);
  if (room.sockets.size >= 8 && !room.sockets.has(user)) return ws.close(4003, 'full');
  room.sockets.get(user)?.ws.close(4001, 'replaced');
  const me = { id: user, username: user, name: user[0].toUpperCase() + user.slice(1), avatar: null };
  const send = (s, m) => s.readyState === 1 && s.send(JSON.stringify(m));
  const others = () => [...room.sockets.values()].filter((x) => x.ws !== ws);
  room.sockets.set(user, { ws, me });
  send(ws, { t: 'welcome', you: me, members: [...room.sockets.values()].map((x) => x.me), state: room.state, now: Date.now() });
  others().forEach((x) => send(x.ws, { t: 'join', member: me }));
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'ping') send(ws, { t: 'pong', c: m.c, s: Date.now() });
    else if (m.t === 'send') (m.to ? [room.sockets.get(m.to)].filter(Boolean) : others()).forEach((x) => send(x.ws, { t: 'msg', from: user, data: m.data, at: Date.now() }));
    else if (m.t === 'set') {
      if (m.value === null) delete room.state[m.key]; else room.state[m.key] = { value: m.value, from: user, at: Date.now() };
      others().forEach((x) => send(x.ws, { t: 'state', key: m.key, value: m.value, from: user, at: Date.now() }));
    }
  });
  ws.on('close', () => {
    if (room.sockets.get(user)?.ws !== ws) return;
    room.sockets.delete(user);
    [...room.sockets.values()].forEach((x) => send(x.ws, { t: 'leave', id: user }));
    if (!room.sockets.size) rooms.delete(key);
  });
});
console.log(`rooms on ws://localhost:${port}`);
