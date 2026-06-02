import { createTts } from '../../race/js/tts.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;

const MIN_R = 40;
const MAX_R = 200;
const MAX_PLAYERS = 45;
/** Margen extra: brillo neón + etiqueta nombre debajo + badge % */
const GLOW_PAD = 36;
const LABEL_BOTTOM = 48;
const LABEL_TOP = 22;
const WELCOME_COOLDOWN_MS = 2800;
let lastWelcomeAt = 0;

const arena = document.getElementById('arena');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const toastEl = document.getElementById('toast');
const demoHint = document.getElementById('demo-hint');
const lbList = document.getElementById('lb-list');
const feed = document.getElementById('feed');
const ttsToggle = document.getElementById('tts-toggle');

/** @type {Map<string, object>} */
const bubbles = new Map();
let isDemo = false;
let toastTimer = null;
let arenaW = 0;
let arenaH = 0;
let tts = createTts({ enabled: true });

/** Paleta neón por jugador */
const NEON = [
  { border: '#00fff7', glow: '#00fff7', soft: 'rgba(0, 255, 247, 0.55)', accent: '#00fff7' },
  { border: '#ff00ea', glow: '#ff00ea', soft: 'rgba(255, 0, 234, 0.55)', accent: '#ff00ea' },
  { border: '#39ff14', glow: '#39ff14', soft: 'rgba(57, 255, 20, 0.5)', accent: '#39ff14' },
  { border: '#ffea00', glow: '#ffea00', soft: 'rgba(255, 234, 0, 0.5)', accent: '#ffea00' },
  { border: '#ff3131', glow: '#ff3131', soft: 'rgba(255, 49, 49, 0.5)', accent: '#ff3131' },
  { border: '#7b61ff', glow: '#a78bfa', soft: 'rgba(123, 97, 255, 0.55)', accent: '#a78bfa' },
  { border: '#00b4ff', glow: '#38bdf8', soft: 'rgba(0, 180, 255, 0.5)', accent: '#38bdf8' },
];

function neonFor(user) {
  let h = 0;
  for (let i = 0; i < user.length; i++) h = (h + user.charCodeAt(i) * 13) % NEON.length;
  return NEON[h];
}

function sizePct(r) {
  return Math.round(((r - MIN_R) / (MAX_R - MIN_R)) * 100);
}

/** Cuanto más grande, menos crece cada tap */
function scaleGrowth(amount, r) {
  const progress = (r - MIN_R) / (MAX_R - MIN_R);
  const factor = Math.max(0.12, 1 - progress * 0.88);
  return amount * factor;
}

function setStatus(text, ok) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status-pill ${ok === true ? 'ok' : ok === false ? 'err' : ''}`;
}

function initTts(config = {}) {
  tts = createTts({
    enabled: config.enabled !== false,
    minChars: config.minChars ?? 8,
    cooldownMs: config.cooldownMs ?? 4500,
    lang: config.lang ?? 'es-MX',
  });
  updateTtsButton();
}

function updateTtsButton() {
  if (!ttsToggle) return;
  if (!tts.isSupported()) {
    ttsToggle.textContent = '🔇 Sin voz';
    ttsToggle.className = 'tts-pill off';
    ttsToggle.disabled = true;
    return;
  }
  const on = ttsToggle.classList.contains('on');
  ttsToggle.textContent = on ? '🔊 Voz ON' : '🔇 Voz OFF';
  ttsToggle.className = `tts-pill ${on ? 'on' : 'off'}`;
  tts.setEnabled(on);
}

if (ttsToggle) {
  ttsToggle.addEventListener('click', () => {
    if (!tts.isSupported()) return;
    ttsToggle.classList.toggle('on');
    updateTtsButton();
  });
}

function pushFeed(html, type = '') {
  if (!feed) return;
  const li = document.createElement('li');
  li.innerHTML = html;
  if (type) li.classList.add(`feed-${type}`);
  feed.prepend(li);
  while (feed.children.length > 4) feed.lastChild?.remove();
}

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2400);
}

function updateCount() {
  if (countEl) countEl.textContent = String(bubbles.size);
}

function updateLeaderboard() {
  if (!lbList) return;
  const top = [...bubbles.values()]
    .sort((a, b) => b.r - a.r)
    .slice(0, 3);
  lbList.innerHTML = top
    .map(
      (b, i) =>
        `<li><span>${i + 1}. ${escapeHtml(b.nickname)}</span><span>${sizePct(b.r)}%</span></li>`
    )
    .join('');
}

function getBounds(r) {
  const minX = r + GLOW_PAD;
  const maxX = Math.max(minX, arenaW - r - GLOW_PAD);
  const minY = r + GLOW_PAD + LABEL_TOP;
  const maxY = Math.max(minY, arenaH - r - GLOW_PAD - LABEL_BOTTOM);
  return { minX, maxX, minY, maxY };
}

function clampBubblePos(b) {
  const { minX, maxX, minY, maxY } = getBounds(b.r);
  if (b.x < minX) {
    b.x = minX;
    b.vx = Math.abs(b.vx);
  } else if (b.x > maxX) {
    b.x = maxX;
    b.vx = -Math.abs(b.vx);
  }
  if (b.y < minY) {
    b.y = minY;
    b.vy = Math.abs(b.vy);
  } else if (b.y > maxY) {
    b.y = maxY;
    b.vy = -Math.abs(b.vy);
  }
}

function randomPos(r) {
  const { minX, maxX, minY, maxY } = getBounds(r);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return {
    x: minX + Math.random() * w,
    y: minY + Math.random() * h,
  };
}

/** Centro visible — para que aparezca al instante al unirse */
function spawnCenterPos(r) {
  const { minX, maxX, minY, maxY } = getBounds(r);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spread = Math.min(90, (maxX - minX) * 0.12, (maxY - minY) * 0.12);
  return {
    x: cx + (Math.random() - 0.5) * spread * 2,
    y: cy + (Math.random() - 0.5) * spread * 2,
  };
}

function speakWelcome(nickname) {
  const now = Date.now();
  if (now - lastWelcomeAt < WELCOME_COOLDOWN_MS) return;
  lastWelcomeAt = now;
  const name = (nickname || 'jugador').replace(/[^\w\sáéíóúñü]/gi, '').slice(0, 30);
  tts.speakRaw(`¡Bienvenido ${name}! Dale tap tap para hacer crecer tu burbuja.`);
}

function speakMaxSize(nickname) {
  const name = (nickname || 'jugador').replace(/[^\w\sáéíóúñü]/gi, '').slice(0, 30);
  tts.speakRaw(`¡${name} alcanzó el tamaño máximo! Qué burbuja tan enorme.`);
}

function applyNeonStyle(el, neon) {
  el.style.setProperty('--neon-border', neon.border);
  el.style.setProperty('--neon-glow', neon.glow);
  el.style.setProperty('--neon-glow-soft', neon.soft);
  el.style.setProperty('--neon-accent', neon.accent);
  el.style.background = `radial-gradient(circle at 32% 28%, ${neon.soft}, rgba(0,0,0,0.5) 70%)`;
}

function createBubbleEl(user, nickname, avatar) {
  const el = document.createElement('div');
  el.className = 'bubble bubble-spawn';
  el.dataset.user = user;
  applyNeonStyle(el, neonFor(user));

  const init = document.createElement('span');
  init.className = 'bubble-initial';
  init.textContent = (nickname || user).charAt(0).toUpperCase();
  el.appendChild(init);

  if (avatar) {
    const img = document.createElement('img');
    img.className = 'bubble-avatar';
    img.src = avatar;
    img.alt = nickname;
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      init.style.display = 'none';
    };
    img.onerror = () => {
      img.remove();
      init.style.display = '';
    };
    el.appendChild(img);
  }

  const pct = document.createElement('span');
  pct.className = 'bubble-pct';
  pct.textContent = '0%';
  el.appendChild(pct);

  const name = document.createElement('span');
  name.className = 'bubble-name';
  name.textContent = nickname || user;
  el.appendChild(name);

  arena.appendChild(el);
  return { el, pctEl: pct };
}

function spawnFloatPlus(x, y, text) {
  const el = document.createElement('span');
  el.className = 'float-plus';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  arena.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

function trimPlayers() {
  if (bubbles.size <= MAX_PLAYERS) return;
  const sorted = [...bubbles.entries()].sort((a, b) => a[1].r - b[1].r);
  const [user, b] = sorted[0];
  b.el.remove();
  bubbles.delete(user);
}

function layoutBubble(b) {
  clampBubblePos(b);
  const d = b.r * 2;
  b.el.style.width = `${d}px`;
  b.el.style.height = `${d}px`;
  b.el.style.left = `${b.x}px`;
  b.el.style.top = `${b.y}px`;
  if (b.pctEl) b.pctEl.textContent = `${sizePct(b.r)}%`;
}

function joinBubble(user, nickname, avatar) {
  if (bubbles.has(user)) return;

  measureArena();
  trimPlayers();
  const r = MIN_R;
  const pos = arenaW > 0 ? spawnCenterPos(r) : { x: 400, y: 300 };
  const { el, pctEl } = createBubbleEl(user, nickname, avatar);
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.35 + Math.random() * 0.4;

  bubbles.set(user, {
    user,
    nickname: nickname || user,
    avatar,
    r,
    x: pos.x,
    y: pos.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    el,
    pctEl,
  });

  const b = bubbles.get(user);
  layoutBubble(b);
  requestAnimationFrame(() => {
    measureArena();
    layoutBubble(b);
  });
  setTimeout(() => el.classList.remove('bubble-spawn'), 500);
  updateCount();
  updateLeaderboard();
  showToast(`✨ ${nickname || user} entró a la arena`);
  pushFeed(`✨ <strong>${escapeHtml(nickname || user)}</strong> comenzó a jugar`);
  speakWelcome(nickname || user);
}

function growBubble(user, amount, source, extra = {}) {
  let b = bubbles.get(user);
  if (!b && source === 'gift') {
    joinBubble(user, user, null);
    b = bubbles.get(user);
  }
  if (!b) return;

  const scaled = scaleGrowth(amount, b.r);
  const before = b.r;
  b.r = Math.min(MAX_R, b.r + scaled);

  if (b.r > before) {
    b.el.classList.remove('pulse-grow');
    void b.el.offsetWidth;
    b.el.classList.add('pulse-grow');
    if (source === 'like') {
      spawnFloatPlus(b.x, b.y - b.r, `+${scaled.toFixed(1)}`);
    }
  }

  if (source === 'gift') {
    b.el.classList.remove('gift-pop');
    void b.el.offsetWidth;
    b.el.classList.add('gift-pop');
    showToast(`🎁 ${b.nickname} — ¡mega burbuja!`);
    pushFeed(`🎁 <strong>${escapeHtml(b.nickname)}</strong> recibió turbo`);
    if (!b.spokeGift) {
      b.spokeGift = true;
      tts.speakRaw(`¡${b.nickname} recibió un regalo! Su burbuja crece a toda velocidad.`);
    }
  }

  if (b.r >= MAX_R - 2 && !b.spokeMax) {
    b.spokeMax = true;
    showToast(`👑 ${b.nickname} — burbuja máxima`);
    speakMaxSize(b.nickname);
  }

  layoutBubble(b);
  updateLeaderboard();
}

function onTtsMessage(msg) {
  const spoke = tts.enqueue(msg.nickname || msg.user, msg.comment);
  if (spoke) {
    pushFeed(
      `🔊 <strong>${escapeHtml(msg.nickname || msg.user)}</strong>`,
      'tts'
    );
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tick() {
  for (const b of bubbles.values()) {
    b.x += b.vx;
    b.y += b.vy;
    clampBubblePos(b);
    layoutBubble(b);
  }
  requestAnimationFrame(tick);
}

function measureArena() {
  if (!arena) return false;
  const rect = arena.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return false;
  arenaW = rect.width;
  arenaH = rect.height;
  for (const b of bubbles.values()) {
    clampBubblePos(b);
    layoutBubble(b);
  }
  return true;
}

function connectWs() {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => setStatus('Conectado', true);

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'hello':
        isDemo = Boolean(msg.demoMode);
        demoHint?.classList.toggle('hidden', !isDemo);
        if (msg.tts) initTts(msg.tts);
        if (msg.connected) setStatus('Live en vivo', true);
        else if (msg.demoMode) setStatus('Modo demo', true);
        else setStatus('Esperando live…', false);
        break;
      case 'status':
        if (msg.state === 'connected') setStatus('Live en vivo', true);
        else if (msg.state === 'error') setStatus(msg.message || 'Sin live', false);
        break;
      case 'bubble_join':
        joinBubble(msg.user, msg.nickname, msg.avatar);
        break;
      case 'bubble_grow':
        growBubble(msg.user, msg.amount, msg.source, msg);
        break;
      case 'tts':
        onTtsMessage(msg);
        break;
      default:
        break;
    }
  };

  ws.onclose = () => {
    setStatus('Sin servidor', false);
    setTimeout(connectWs, 2000);
  };
}

function demoKeys(e) {
  if (!isDemo) return;
  const u = `fan_${Math.floor(Math.random() * 800 + 100)}`;
  if (e.key === 'j' || e.key === 'J') {
    joinBubble(u, u, null);
  } else if (e.key === 'l' || e.key === 'L') {
    const last = [...bubbles.keys()].pop();
    if (last) growBubble(last, 0.5, 'like');
  } else if (e.key === 'g' || e.key === 'G') {
    const last = [...bubbles.keys()].pop();
    if (last) growBubble(last, 14, 'gift', { giftName: 'Rosa' });
  } else if (e.key === 't' || e.key === 'T') {
    onTtsMessage({
      nickname: 'fan_seguidor',
      comment: 'mi burbuja va a ser la más grande del live',
    });
  }
}

function scaleStage() {
  const stage = document.getElementById('app');
  if (!stage) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
  requestAnimationFrame(measureArena);
}

document.addEventListener(
  'click',
  () => {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0.01;
    window.speechSynthesis.speak(u);
  },
  { once: true }
);

if (arena && typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => measureArena());
  ro.observe(arena);
}

initTts();
scaleStage();
window.addEventListener('resize', scaleStage);
window.addEventListener('keydown', demoKeys);
connectWs();
requestAnimationFrame(() => {
  measureArena();
  tick();
});
