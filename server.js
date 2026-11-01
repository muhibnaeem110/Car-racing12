'use strict';
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const rooms = new Map();
const MAX_PLAYERS = 2;
const ROOM_TTL = 2 * 60 * 60 * 1000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ name: 'CAR RACING X Multiplayer', online: true, rooms: rooms.size }));
});
const wss = new WebSocketServer({ server, path: '/multiplayer', maxPayload: 2048 });

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}
function cleanName(value) {
  return String(value || 'Racer').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 14) || 'Racer';
}
function roomSnapshot(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, x: p.state.x, speed: p.state.speed,
    car: p.state.car, ready: p.state.ready
  }));
}
function broadcast(room, data) {
  for (const player of room.players.values()) send(player.ws, data);
}
function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.players.delete(ws.playerId);
  ws.room = null;
  ws.playerId = null;
  if (!room.players.size) rooms.delete(room.code);
  else broadcast(room, { type: 'players', players: roomSnapshot(room) });
}
function joinRoom(ws, room, name) {
  if (room.players.size >= MAX_PLAYERS) {
    send(ws, { type: 'error', message: 'That room is full.' });
    return;
  }
  const id = crypto.randomUUID();
  const player = { id, name: cleanName(name), ws, state: { x: 0, speed: 0, car: '#36f5ff', ready: false } };
  room.players.set(id, player);
  ws.room = room;
  ws.playerId = id;
  room.updatedAt = Date.now();
  send(ws, { type: 'joined', room: room.code, playerId: id, players: roomSnapshot(room) });
  broadcast(room, { type: 'players', players: roomSnapshot(room) });
}
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', message: 'Invalid message.' }); return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'create') {
      leave(ws);
      let roomCode;
      do { roomCode = code(); } while (rooms.has(roomCode));
      const room = { code: roomCode, players: new Map(), updatedAt: Date.now() };
      rooms.set(roomCode, room);
      joinRoom(ws, room, msg.name);
      return;
    }
    if (msg.type === 'join') {
      leave(ws);
      const roomCode = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      const room = rooms.get(roomCode);
      if (!room) { send(ws, { type: 'error', message: 'Room not found. Check the code.' }); return; }
      joinRoom(ws, room, msg.name);
      return;
    }
    if (msg.type === 'state' && ws.room) {
      const p = ws.room.players.get(ws.playerId);
      if (!p) return;
      p.state = {
        x: Math.max(-4.25, Math.min(4.25, Number(msg.x) || 0)),
        speed: Math.max(0, Math.min(400, Number(msg.speed) || 0)),
        car: /^#[0-9a-f]{6}$/i.test(msg.car) ? msg.car : '#36f5ff',
        ready: !!msg.ready
      };
      ws.room.updatedAt = Date.now();
      broadcast(ws.room, { type: 'state', player: { id: p.id, ...p.state } });
      return;
    }
    if (msg.type === 'leave') leave(ws);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [key, room] of rooms) if (!room.players.size || now - room.updatedAt > ROOM_TTL) rooms.delete(key);
}, 30000);
server.listen(PORT, HOST, () => console.log('CAR RACING X multiplayer listening on ' + HOST + ':' + PORT));
process.on('SIGTERM', () => { clearInterval(heartbeat); for (const ws of wss.clients) ws.close(); server.close(() => process.exit(0)); });
