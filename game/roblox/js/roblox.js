import { createTts } from '../../race/js/tts.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;

const FINISH = 92;
const START = 6;
const MAX_RACERS = 18;
const ROUND_RESET_MS = 6500;
const COMBO_LIKES = 6;
const COMBO_WINDOW = 3000;
const COMBO_MULT = 2;
const COMBO_DURATION = 5000;
const IDLE_PROMPT_MS = 24000;
const IDLE_COOLDOWN_MS = 45000;

const WELCOME_LINES = [
  '¡Bienvenidos a la Arena Roblox Live!',
  'Comenta tu usuario de Roblox para aparecer en la pista.',
  'Dale tap tap para correr. Los regalos son nitro turbo.',
];

const IDLE_LINES = [
  '¡Comenta tu usuario Roblox y únete al sprint!',
  '¡Dale tap tap si ya estás en la carrera!',
  '¿Quién llega primero a la meta? ¡Empujen con likes!',
];

const state = {
  racers: new Map(),
  round: 1,
  frozen: false,
  isDemo: false,
  comboUntil: new Map(),
  likeBuckets: new Map(),
};

let tts = createTts({ enabled: true });
let lastActivity = Date.now();
let lastIdlePrompt = 0;
let welcomePlayed = false;
let narratorTimer = null;

const $ = (id) => document.getElementById(id);
const lanesEl = $('#lanes');
const leaderboard = $('#leaderboard');
const feed = $('#feed');
const overlay = $('#overlay');
const winnerAvatar = $('#winner-avatar');
const overlayTitle = $('#overlay-title');
const overlaySub = $('#overlay-sub');
const roundEl = $('#round');
const racerN = $('#racer-n');
const statusEl = $('#status');
const demoHint = $('#demo-hint');
const ttsToggle = $('#tts-toggle');
const comboFlash = $('#combo-flash');
const nitroBanner = $('#nitro-banner');
const narratorBanner = $('#narrator-banner');
const stage = $('#app');

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
  const on = ttsToggle.classList.contains('on');
  ttsToggle.textContent = on ? '🔊 Voz ON' : '🔇 Voz OFF';
  ttsToggle.className = `tts-pill ${on ? 'on' : 'off'}`;
  tts.setEnabled(on);
}

ttsToggle?.addEventListener('click', () => {
  ttsToggle.classList.toggle('on');
  updateTtsButton();
});

function setStatus(text, ok) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status-pill ${ok === true ? 'ok' : ok === false ? 'err' : ''}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function touchActivity() {
  lastActivity = Date.now();
}

function showNarrator(text) {
  if (!narratorBanner) return;
  narratorBanner.textContent = text;
  narratorBanner.classList.remove('hidden');
  clearTimeout(narratorTimer);
  narratorTimer = setTimeout(() => narratorBanner.classList.add('hidden'), 5200);
}

function playWelcome() {
  if (welcomePlayed) return;
  welcomePlayed = true;
  WELCOME_LINES.forEach((line, i) => {
    setTimeout(() => {
      tts.speakRaw(line);
      if (i === 0) showNarrator(line);
    }, i * 5200);
  });
}

function promptIdle() {
  if (state.frozen) return;
  const now = Date.now();
  if (now - lastActivity < IDLE_PROMPT_MS) return;
  if (now - lastIdlePrompt < IDLE_COOLDOWN_MS) return;
  lastIdlePrompt = now;
  const line = IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
  tts.speakRaw(line);
  showNarrator(line);
}

function pushFeed(html) {
  if (!feed) return;
  const li = document.createElement('li');
  li.innerHTML = html;
  feed.prepend(li);
  while (feed.children.length > 5) feed.lastChild?.remove();
}

function progressPct(p) {
  return Math.round(((p - START) / (FINISH - START)) * 100);
}

function getComboMult(user) {
  return Date.now() < (state.comboUntil.get(user) || 0) ? COMBO_MULT : 1;
}

function trackCombo(user, likes) {
  const now = Date.now();
  if (!state.likeBuckets.has(user)) state.likeBuckets.set(user, []);
  const bucket = state.likeBuckets.get(user);
  bucket.push({ t: now, n: likes });
  state.likeBuckets.set(
    user,
    bucket.filter((x) => now - x.t < COMBO_WINDOW)
  );
  const total = state.likeBuckets.get(user).reduce((s, x) => s + x.n, 0);
  if (total >= COMBO_LIKES && now >= (state.comboUntil.get(user) || 0)) {
    state.comboUntil.set(user, now + COMBO_DURATION);
    comboFlash?.classList.remove('hidden');
    setTimeout(() => comboFlash?.classList.add('hidden'), 1200);
    pushFeed('🔥 <strong>¡COMBO x2!</strong>');
  }
}

function updateLeaderboard() {
  if (!leaderboard) return;
  const sorted = [...state.racers.entries()]
    .sort((a, b) => b[1].progress - a[1].progress)
    .slice(0, 5);
  leaderboard.innerHTML = sorted
    .map(([user, r], i) => {
      return `<li>
        <img src="${escapeHtml(r.thumbUrl)}" alt="" />
        <span>${i + 1}. ${escapeHtml(r.robloxName)}</span>
        <span>${progressPct(r.progress)}%</span>
      </li>`;
    })
    .join('');
}

function renderRacers() {
  let leader = -1;
  for (const r of state.racers.values()) {
    if (r.progress > leader) leader = r.progress;
  }

  for (const r of state.racers.values()) {
    const pct = Math.max(START, Math.min(FINISH, r.progress));
    const left = `${pct}%`;
    if (r.racerEl) r.racerEl.style.left = left;
    if (r.trailEl) r.trailEl.style.width = left;
    if (r.pctEl) r.pctEl.textContent = `${progressPct(pct)}%`;
    if (r.laneEl) {
      r.laneEl.classList.toggle('leading', r.progress === leader && leader > START);
      r.laneEl.classList.toggle('combo', Date.now() < (state.comboUntil.get(r.user) || 0));
    }
  }

  if (racerN) racerN.textContent = String(state.racers.size);
  updateLeaderboard();
}

function joinRacer(msg) {
  const user = msg.user;
  if (!user || state.racers.has(user) || state.racers.size >= MAX_RACERS) return;

  touchActivity();
  const lane = document.createElement('div');
  lane.className = 'lane-row';

  const trail = document.createElement('div');
  trail.className = 'lane-trail';

  const racer = document.createElement('div');
  racer.className = 'racer';
  racer.innerHTML = `
    <div class="racer-img-wrap">
      <img class="racer-img" src="${escapeHtml(msg.thumbUrl)}" alt="${escapeHtml(msg.robloxName)}" referrerpolicy="no-referrer" />
    </div>
    <span class="racer-name">${escapeHtml(msg.robloxName)}</span>
  `;

  const pct = document.createElement('span');
  pct.className = 'racer-pct';
  pct.textContent = '0%';
  lane.appendChild(trail);
  lane.appendChild(racer);
  lane.appendChild(pct);

  lanesEl?.appendChild(lane);

  const img = racer.querySelector('.racer-img');
  img?.addEventListener('error', () => {
    img.src = `https://www.roblox.com/headshot-thumbnail/image?userId=${msg.robloxUserId || 1}&width=352&height=352&format=png`;
  });

  state.racers.set(user, {
    user,
    robloxName: msg.robloxName,
    robloxUserId: msg.robloxUserId,
    thumbUrl: msg.thumbUrl,
    tiktokNick: msg.tiktokNick || user,
    progress: START,
    laneEl: lane,
    trailEl: trail,
    racerEl: racer,
    pctEl: pct,
  });

  renderRacers();
  pushFeed(`🎮 <strong>${escapeHtml(msg.robloxName)}</strong> entró a la pista`);
  tts.speakRaw(
    `¡${msg.robloxName} apareció en la arena! Dale tap tap para correr hacia la meta.`
  );
}

function applyPush(user, amount, source, extra = {}) {
  const r = state.racers.get(user);
  if (!r || state.frozen || amount <= 0) return;
  touchActivity();

  const mult = source === 'like' ? getComboMult(user) : 1;
  r.progress = Math.min(FINISH, r.progress + amount * 0.42 * mult);

  if (source === 'like') trackCombo(user, extra.likeCount || 1);

  if (extra.nitro) {
    r.racerEl?.classList.add('nitro');
    nitroBanner?.classList.remove('hidden');
    setTimeout(() => {
      r.racerEl?.classList.remove('nitro');
      nitroBanner?.classList.add('hidden');
    }, 1200);
    pushFeed(`⚡ <strong>${escapeHtml(r.robloxName)}</strong> ¡NITRO!`);
    tts.speakRaw(`¡Nitro para ${r.robloxName}!`);
  }

  renderRacers();

  if (r.progress >= FINISH) winRound(r);
}

function winRound(winner) {
  if (state.frozen) return;
  state.frozen = true;
  touchActivity();

  if (winnerAvatar) {
    winnerAvatar.src = winner.thumbUrl;
    winnerAvatar.alt = winner.robloxName;
  }
  if (overlayTitle) overlayTitle.textContent = '¡GANADOR DEL SPRINT!';
  if (overlaySub) overlaySub.textContent = `${winner.robloxName} · ${state.racers.size} corredores`;
  overlay?.classList.remove('hidden');

  pushFeed(`🏆 <strong>${escapeHtml(winner.robloxName)}</strong> ¡llegó a la meta!`);
  tts.speakRaw(`¡${winner.robloxName} ganó el sprint! Nueva ronda pronto.`);

  setTimeout(resetRound, ROUND_RESET_MS);
}

function resetRound() {
  state.frozen = false;
  state.round += 1;
  if (roundEl) roundEl.textContent = String(state.round);
  overlay?.classList.add('hidden');
  state.comboUntil.clear();
  state.likeBuckets.clear();

  for (const r of state.racers.values()) {
    r.laneEl?.remove();
  }
  state.racers.clear();
  renderRacers();
  touchActivity();
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
        state.isDemo = Boolean(msg.demoMode);
        demoHint?.classList.toggle('hidden', !state.isDemo);
        if (msg.tts) initTts(msg.tts);
        if (msg.connected) setStatus('Live en vivo', true);
        else if (msg.demoMode) setStatus('Modo demo', true);
        setTimeout(playWelcome, 1200);
        break;
      case 'status':
        if (msg.state === 'connected') {
          setStatus('Live en vivo', true);
          if (!welcomePlayed) setTimeout(playWelcome, 1200);
        }
        break;
      case 'roblox_join':
        joinRacer(msg);
        break;
      case 'roblox_push':
        applyPush(msg.user, msg.amount, msg.source, msg);
        break;
      case 'roblox_error':
        pushFeed(`❌ <strong>${escapeHtml(msg.robloxName)}</strong> no encontrado`);
        tts.speakRaw(`No encontramos el usuario ${msg.robloxName} en Roblox. Revisa el nombre.`);
        break;
      case 'roblox_already':
        pushFeed(`ℹ️ Ya estás en pista como <strong>${escapeHtml(msg.robloxName)}</strong>`);
        break;
      case 'tts':
        touchActivity();
        tts.enqueue(msg.nickname || msg.user, msg.comment);
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

function demoJoin() {
  const id = Date.now() % 100000;
  const demos = [
    { name: 'Builderman', userId: 1 },
    { name: 'Roblox', userId: 156 },
    { name: 'Guest', userId: 2 },
  ];
  const pick = demos[Math.floor(Math.random() * demos.length)];
  joinRacer({
    user: `demo_${id}`,
    robloxName: pick.name,
    robloxUserId: pick.userId,
    thumbUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${pick.userId}&width=352&height=352&format=png`,
    tiktokNick: 'demo',
  });
}

function demoKeys(e) {
  if (!state.isDemo) return;
  const u = [...state.racers.keys()][0] || `demo_${Date.now()}`;
  if (e.key === 'u' || e.key === 'U') demoJoin();
  else if (e.key === 'l' || e.key === 'L') {
    if (state.racers.size === 0) demoJoin();
    applyPush(u, 8, 'like', { likeCount: 1 });
  } else if (e.key === 'g' || e.key === 'G') {
    if (state.racers.size === 0) demoJoin();
    applyPush(u, 35, 'gift', { nitro: true, giftName: 'Rosa' });
  }
}

function scaleStage() {
  if (!stage) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}

document.addEventListener(
  'click',
  () => {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0.01;
    speechSynthesis.speak(u);
  },
  { once: true }
);

initTts();
scaleStage();
window.addEventListener('resize', scaleStage);
window.addEventListener('keydown', demoKeys);
setInterval(promptIdle, 4000);
connectWs();
