import 'dotenv/config';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import tiktokLiveConnector from 'tiktok-live-connector';
import { parseRobloxUsername, resolveRobloxUser, fetchAvatarThumbnail } from './roblox-api.js';
import { createCrystalHandlers } from './crystal.js';

const { WebcastPushConnection } = tiktokLiveConnector;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const GAME_ROOT = join(PROJECT_ROOT, 'game');
const ASSETS_ROOT = join(PROJECT_ROOT, 'assets');

const HTTP_PORT = Number(process.env.HTTP_PORT) || 3000;
const WS_PORT = Number(process.env.WS_PORT) || 8765;
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || '').replace(/^@/, '').trim();
const DEMO_MODE = process.env.DEMO_MODE === 'true';

const LIKE_POWER = Number(process.env.LIKE_POWER) || 1.2;
const GIFT_BOOST_BASE = Number(process.env.GIFT_BOOST_BASE) || 8;
const FOLLOW_BOOST = Number(process.env.FOLLOW_BOOST) || 15;
const TTS_ENABLED = process.env.TTS_ENABLED !== 'false';
const TTS_MIN_CHARS = Number(process.env.TTS_MIN_CHARS) || 8;
const BUBBLE_LIKE_GROW = Number(process.env.BUBBLE_LIKE_GROW) || 0.4;
const BUBBLE_GIFT_GROW = Number(process.env.BUBBLE_GIFT_GROW) || 10;
const COFRE_LIKE_FILL = Number(process.env.COFRE_LIKE_FILL) || 0.12;
const COFRE_GIFT_FILL = Number(process.env.COFRE_GIFT_FILL) || 9;
const DRAGON_LIKE_DAMAGE = Number(process.env.DRAGON_LIKE_DAMAGE) || 0.9;
const DRAGON_GIFT_DAMAGE = Number(process.env.DRAGON_GIFT_DAMAGE) || 28;
const ROBLOX_LIKE_PUSH = Number(process.env.ROBLOX_LIKE_PUSH) || 1.1;
const ROBLOX_GIFT_PUSH = Number(process.env.ROBLOX_GIFT_PUSH) || 14;
const REY_LIKE_POINTS = Number(process.env.REY_LIKE_POINTS) || 1.2;
const REY_GIFT_POINTS = Number(process.env.REY_GIFT_POINTS) || 22;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/** @type {Map<string, 1 | 2>} */
const userTeams = new Map();
/** @type {Map<string, { nickname: string, avatar: string | null }>} */
const bubblePlayers = new Map();
/** @type {Map<string, { nickname: string, avatar: string | null }>} */
const cofreHunters = new Map();
/** @type {Map<string, { nickname: string, avatar: string | null }>} */
const dragonHeroes = new Map();
/** @type {Map<string, { robloxName: string, robloxUserId: number, thumbUrl: string, tiktokNick: string }>} */
const robloxRacers = new Map();
/** @type {Map<string, { nickname: string, avatar: string | null }>} */
const hillContenders = new Map();
/** @type {Set<WebSocket>} */
const clients = new Set();

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

const crystal = createCrystalHandlers(broadcast, {
  skipCommands: (comment) =>
    Boolean(
      parseTeam(comment) ||
        parseJugar(comment) ||
        parseCofre(comment) ||
        parseAtacar(comment) ||
        parseRey(comment) ||
        parseRobloxUsername(comment)
    ),
});

function parseTeam(comment) {
  const raw = (comment || '').trim();
  const t = raw.toLowerCase();
  if (/^1[.!?\s]*$|^#?1$|equipo\s*1|team\s*1|azul|blue|🔵/.test(t)) return 1;
  if (/^2[.!?\s]*$|^#?2$|equipo\s*2|team\s*2|rojo|red|🔴/.test(t)) return 2;
  return null;
}

function parseJugar(comment) {
  const t = (comment || '').trim().toLowerCase();
  return /^jugar[.!?\s]*$|^quiero\s*jugar$|^play$/.test(t);
}

function joinBubble(data) {
  const user = data.uniqueId;
  if (!user || bubblePlayers.has(user)) return;
  const nickname = data.nickname || user;
  const avatar = data.profilePictureUrl || null;
  bubblePlayers.set(user, { nickname, avatar });
  broadcast({
    type: 'bubble_join',
    user,
    nickname,
    avatar,
  });
  console.log(`  [burbuja] @${user} entró`);
}

function growBubble(user, amount, source, extra = {}) {
  if (!bubblePlayers.has(user) && source !== 'gift') return;
  broadcast({
    type: 'bubble_grow',
    user,
    amount,
    source,
    ...extra,
  });
}

function parseCofre(comment) {
  const t = (comment || '').trim().toLowerCase();
  return /^cofre[.!?\s]*$|^tesoro[.!?\s]*$|^oro[.!?\s]*$|^gold[.!?\s]*$|^abrir[.!?\s]*$/.test(t);
}

function joinCofre(data) {
  const user = data.uniqueId;
  if (!user || cofreHunters.has(user)) return;
  cofreHunters.set(user, {
    nickname: data.nickname || user,
    avatar: data.profilePictureUrl || null,
  });
  broadcast({
    type: 'cofre_join',
    user,
    nickname: data.nickname || user,
    avatar: data.profilePictureUrl || null,
  });
  console.log(`  [cofre] @${user} se unió`);
}

function addCofreFill(amount, source, user, extra = {}) {
  if (amount <= 0) return;
  broadcast({
    type: 'cofre_fill',
    amount,
    source,
    user: user || null,
    ...extra,
  });
}

function parseAtacar(comment) {
  const t = (comment || '').trim().toLowerCase();
  return /^atacar[.!?\s]*$|^ataco[.!?\s]*$|^raid[.!?\s]*$|^dragon[.!?\s]*$|^pelea[.!?\s]*$/.test(t);
}

function joinDragon(data) {
  const user = data.uniqueId;
  if (!user || dragonHeroes.has(user)) return;
  dragonHeroes.set(user, {
    nickname: data.nickname || user,
    avatar: data.profilePictureUrl || null,
  });
  broadcast({
    type: 'dragon_join',
    user,
    nickname: data.nickname || user,
    avatar: data.profilePictureUrl || null,
  });
  console.log(`  [dragón] @${user} héroe`);
}

function dragonHit(amount, source, user, extra = {}) {
  if (amount <= 0) return;
  broadcast({
    type: 'dragon_hit',
    amount,
    source,
    user: user || null,
    crit: source === 'gift',
    ...extra,
  });
}

function robloxPush(user, amount, source, extra = {}) {
  if (!robloxRacers.has(user) || amount <= 0) return;
  broadcast({
    type: 'roblox_push',
    user,
    amount,
    source,
    nitro: source === 'gift',
    ...extra,
  });
}

function parseRey(comment) {
  const t = (comment || '').trim().toLowerCase();
  return /^rey[.!?\s]*$|^corona[.!?\s]*$|^colina[.!?\s]*$|^tron[.!?\s]*$|^quiero\s*rey[.!?\s]*$|^subo[.!?\s]*$/.test(
    t
  );
}

function joinHill(data) {
  const user = data.uniqueId;
  if (!user || hillContenders.has(user)) return;
  hillContenders.set(user, {
    nickname: data.nickname || user,
    avatar: data.profilePictureUrl || null,
  });
  broadcast({
    type: 'hill_join',
    user,
    nickname: data.nickname || user,
    avatar: data.profilePictureUrl || null,
  });
  console.log(`  [colina] @${user} subió`);
}

function hillPoints(user, amount, source, extra = {}) {
  if (!hillContenders.has(user) || amount <= 0) return;
  broadcast({
    type: 'hill_points',
    user,
    amount,
    source,
    nitro: source === 'gift',
    ...extra,
  });
}

async function joinRoblox(tiktokData, robloxName) {
  const user = tiktokData.uniqueId;
  if (!user || !robloxName) return;

  const existing = robloxRacers.get(user);
  if (existing && existing.robloxName.toLowerCase() === robloxName.toLowerCase()) {
    broadcast({ type: 'roblox_already', user, robloxName: existing.robloxName });
    return;
  }

  try {
    const { userId, name } = await resolveRobloxUser(robloxName);
    const thumbUrl = await fetchAvatarThumbnail(userId);
    robloxRacers.set(user, {
      robloxName: name,
      robloxUserId: userId,
      thumbUrl,
      tiktokNick: tiktokData.nickname || user,
    });
    broadcast({
      type: 'roblox_join',
      user,
      robloxName: name,
      robloxUserId: userId,
      thumbUrl,
      tiktokNick: tiktokData.nickname || user,
    });
    console.log(`  [roblox] @${user} → ${name} (${userId})`);
  } catch (err) {
    const msg = err.message || 'No encontrado';
    broadcast({
      type: 'roblox_error',
      user,
      robloxName,
      message: msg,
      tiktokNick: tiktokData.nickname || user,
    });
    console.log(`  [roblox] @${user} falló "${robloxName}": ${msg}`);
  }
}

function assignTeam(uniqueId, team, extra = {}) {
  const prev = userTeams.get(uniqueId);
  userTeams.set(uniqueId, team);
  broadcast({
    type: 'team_join',
    user: uniqueId,
    team,
    nickname: extra.nickname || uniqueId,
    changed: prev !== team,
  });
}

function getTeam(uniqueId) {
  return userTeams.get(uniqueId) ?? null;
}

function addBoost(team, amount, source, user, extra = {}) {
  if (!team || amount <= 0) return;
  broadcast({
    type: 'boost',
    team,
    amount,
    source,
    user: user || null,
    ...extra,
  });
}

async function serveStatic(req, res) {
  let path = req.url?.split('?')[0] || '/';
  if (path === '/') path = '/index.html';
  if (path.endsWith('/')) path += 'index.html';

  let filePath;
  let allowedRoot;
  if (path.startsWith('/assets/')) {
    filePath = join(ASSETS_ROOT, path.slice('/assets/'.length));
    allowedRoot = ASSETS_ROOT;
  } else {
    filePath = join(GAME_ROOT, path);
    allowedRoot = GAME_ROOT;
  }

  if (!filePath.startsWith(allowedRoot)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const httpServer = createServer(serveStatic);
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Puerto ${HTTP_PORT} en uso. Cierra el servidor anterior o ejecuta:`);
    console.error(`  npm run stop\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
httpServer.listen(HTTP_PORT, () => {
  console.log(`\n  Menú:     http://localhost:${HTTP_PORT}/`);
  console.log(`  Carrera:  http://localhost:${HTTP_PORT}/race/`);
  console.log(`  Burbujas: http://localhost:${HTTP_PORT}/bubbles/`);
  console.log(`  Cofre:    http://localhost:${HTTP_PORT}/cofre/`);
  console.log(`  Dragón:   http://localhost:${HTTP_PORT}/dragon/`);
  console.log(`  Roblox:   http://localhost:${HTTP_PORT}/roblox/`);
  console.log(`  Rey:      http://localhost:${HTTP_PORT}/rey/`);
  console.log(`  Bola:     http://localhost:${HTTP_PORT}/crystal/`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}\n`);
});

const wss = new WebSocketServer({ port: WS_PORT });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(
    JSON.stringify({
      type: 'hello',
      demoMode: DEMO_MODE,
      tiktokUser: TIKTOK_USERNAME || null,
      connected: Boolean(tiktokConnection?.getState?.()?.isConnected),
      tts: {
        enabled: TTS_ENABLED,
        minChars: TTS_MIN_CHARS,
        cooldownMs: Number(process.env.TTS_COOLDOWN_MS) || 4500,
        lang: process.env.TTS_LANG || 'es-MX',
      },
    })
  );
  ws.on('close', () => clients.delete(ws));
});

/** @type {import('tiktok-live-connector').WebcastPushConnection | null} */
let tiktokConnection = null;
let reconnectTimer = null;

function onTikTokConnected(state) {
  console.log(`  ✓ Conectado al live de @${TIKTOK_USERNAME} (room ${state.roomId})`);
  broadcast({ type: 'status', state: 'connected', roomId: state.roomId });
}

function scheduleReconnect(reason) {
  if (DEMO_MODE) return;
  clearTimeout(reconnectTimer);
  console.log(`  Reintento en 8s… (${reason})`);
  broadcast({ type: 'status', state: 'reconnecting', message: reason });
  reconnectTimer = setTimeout(connectTikTok, 8000);
}

function connectTikTok() {
  clearTimeout(reconnectTimer);

  if (DEMO_MODE) {
    console.log('  Modo DEMO — Carrera: 1/2/L/G · Bola: P/M/G · Rey: R/L/G · Roblox: U/L/G · Burbujas: J/L/G · Cofre: C/L/G · Dragón: A/L/G\n');
    broadcast({ type: 'status', state: 'demo' });
    return;
  }

  if (!TIKTOK_USERNAME) {
    console.error('  Falta TIKTOK_USERNAME en .env — copia .env.example a .env\n');
    broadcast({ type: 'status', state: 'error', message: 'Configura TIKTOK_USERNAME en .env' });
    return;
  }

  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch {
      /* ignore */
    }
    tiktokConnection.removeAllListeners();
  }

  tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
  });

  tiktokConnection.on('connected', onTikTokConnected);

  tiktokConnection.on('disconnected', () => {
    console.log('  Desconectado del live.');
    broadcast({ type: 'status', state: 'disconnected' });
    scheduleReconnect('desconectado');
  });

  tiktokConnection.on('chat', (data) => {
    const comment = (data.comment ?? data.content ?? '').trim();
    if (!comment) return;

    if (parseJugar(comment)) {
      joinBubble(data);
    }

    if (parseCofre(comment)) {
      joinCofre(data);
    }

    if (parseAtacar(comment)) {
      joinDragon(data);
    }

    const robloxName = parseRobloxUsername(comment);
    if (robloxName) {
      joinRoblox(data, robloxName);
    }

    if (parseRey(comment)) {
      joinHill(data);
    }

    const crystalQuestion = crystal.parseQuestion(comment);
    if (crystalQuestion) {
      crystal.ask(data, crystalQuestion);
    }

    const team = parseTeam(comment);
    if (team) {
      console.log(`  [chat] @${data.uniqueId} → equipo ${team}`);
      assignTeam(data.uniqueId, team, { nickname: data.nickname || data.uniqueId });
    }

    const followRole = Number(data.followRole) || 0;
    if (
      TTS_ENABLED &&
      followRole >= 1 &&
      !team &&
      !parseJugar(comment) &&
      !parseCofre(comment) &&
      !parseAtacar(comment) &&
      !robloxName &&
      !parseRey(comment) &&
      !crystalQuestion &&
      comment.length >= TTS_MIN_CHARS
    ) {
      console.log(`  [tts] @${data.uniqueId}: ${comment.slice(0, 50)}`);
      broadcast({
        type: 'tts',
        user: data.uniqueId,
        nickname: data.nickname || data.uniqueId,
        comment,
      });
    }
  });

  tiktokConnection.on('like', (data) => {
    const user = data.uniqueId;
    const likeCount = data.likeCount || 1;

    addCofreFill(Math.max(0.05, likeCount * COFRE_LIKE_FILL), 'like', user, { likeCount });

    const dragonDmg = Math.max(0.4, likeCount * DRAGON_LIKE_DAMAGE);
    dragonHit(dragonDmg, 'like', user, { likeCount });

    if (robloxRacers.has(user)) {
      robloxPush(user, Math.max(0.5, likeCount * ROBLOX_LIKE_PUSH), 'like', { likeCount });
    }

    if (hillContenders.has(user)) {
      hillPoints(user, Math.max(0.4, likeCount * REY_LIKE_POINTS), 'like', { likeCount });
    }

    crystal.onLike(data);

    if (bubblePlayers.has(user)) {
      const grow = Math.max(1, likeCount * BUBBLE_LIKE_GROW);
      growBubble(user, grow, 'like', { likeCount });
    }

    const team = getTeam(user);
    if (team) {
      const amount = Math.max(1, likeCount * LIKE_POWER);
      addBoost(team, amount, 'like', user, { likeCount });
      return;
    }

    if (!bubblePlayers.has(user)) {
      console.log(`  [like] @${user} (comenta jugar o 1/2)`);
    }
  });

  tiktokConnection.on('gift', (data) => {
    const user = data.uniqueId;
    const diamonds = data.diamondCount || data.gift?.diamond_count || 1;
    const repeat = data.repeatCount || 1;
    const giftName = data.giftName || data.gift?.name || 'regalo';

    crystal.onGift({
      uniqueId: user,
      nickname: data.nickname,
      profilePictureUrl: data.profilePictureUrl,
      giftName,
    });

    const cofreGift = Math.max(COFRE_GIFT_FILL, diamonds * COFRE_GIFT_FILL * 0.35) * repeat;
    addCofreFill(cofreGift, 'gift', user, { giftName, repeat });

    const dragonGift = Math.max(DRAGON_GIFT_DAMAGE, diamonds * DRAGON_GIFT_DAMAGE * 0.4) * repeat;
    dragonHit(dragonGift, 'gift', user, { giftName, repeat, crit: true });

    if (robloxRacers.has(user)) {
      const push = Math.max(ROBLOX_GIFT_PUSH, diamonds * ROBLOX_GIFT_PUSH * 0.35) * repeat;
      robloxPush(user, push, 'gift', { giftName, repeat });
    }

    if (hillContenders.has(user)) {
      const pts = Math.max(REY_GIFT_POINTS, diamonds * REY_GIFT_POINTS * 0.35) * repeat;
      hillPoints(user, pts, 'gift', { giftName, repeat });
    } else {
      joinHill(data);
      const pts = Math.max(REY_GIFT_POINTS * 0.8, diamonds * REY_GIFT_POINTS * 0.3) * repeat;
      hillPoints(user, pts, 'gift', { giftName, repeat });
    }

    if (bubblePlayers.has(user)) {
      const grow = Math.max(BUBBLE_GIFT_GROW, diamonds * BUBBLE_GIFT_GROW * 0.4) * repeat;
      growBubble(user, grow, 'gift', { giftName, repeat });
    } else {
      joinBubble(data);
      const grow = Math.max(BUBBLE_GIFT_GROW * 1.5, diamonds * BUBBLE_GIFT_GROW * 0.5) * repeat;
      growBubble(user, grow, 'gift', { giftName, repeat });
    }

    let team = getTeam(user);
    if (team) {
      const amount = Math.max(GIFT_BOOST_BASE, diamonds * GIFT_BOOST_BASE * 0.5) * repeat;
      addBoost(team, amount, 'gift', user, { giftName, repeat });
      const rival = team === 1 ? 2 : 1;
      broadcast({
        type: 'slow',
        team: rival,
        duration: 2000,
        user,
        fromTeam: team,
        giftName,
      });
      console.log(`  [gift] @${user} carrera eq.${team} + burbuja`);
      return;
    }

    console.log(`  [gift] @${user} burbuja +${giftName}`);
  });

  tiktokConnection.on('social', (data) => {
    const label = (data.label || '').toLowerCase();
    const display = (data.displayType || '').toLowerCase();
    const isFollow =
      label.includes('follow') || display.includes('follow');
    if (!isFollow) return;

    let team = getTeam(data.uniqueId);
    if (!team) {
      team = Math.random() < 0.5 ? 1 : 2;
      assignTeam(data.uniqueId, team, { nickname: data.nickname || data.uniqueId });
    }
    addBoost(team, FOLLOW_BOOST, 'follow', data.uniqueId);
  });

  console.log(`  Conectando a @${TIKTOK_USERNAME}…`);

  tiktokConnection
    .connect()
    .then((state) => onTikTokConnected(state))
    .catch((err) => {
      const msg = err.message || String(err);
      console.error('\n  ✗ No se pudo conectar:', msg);
      broadcast({
        type: 'status',
        state: 'error',
        message: 'Inicia el live en TikTok y espera el reintento automático',
      });
      scheduleReconnect(msg);
    });
}

connectTikTok();

console.log('  ═══════════════════════════════════════');
console.log('   HAPPY STORY LIVE — Menú de experiencias');
console.log('   http://localhost:' + HTTP_PORT + '/');
console.log('  ═══════════════════════════════════════');
