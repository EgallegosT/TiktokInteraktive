import { createTts } from '../../race/js/tts.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;

const GOAL = 100;
const DECAY_PER_SEC = 0.045;
const COMBO_WINDOW = 3000;
const COMBO_LIKES = 8;
const COMBO_MULT = 2;
const MAX_HUNTERS = 28;
const VICTORY_MS = 7000;

const state = {
  progress: 0,
  warmth: 100,
  round: 1,
  frozen: false,
  hunters: new Map(),
  contributions: new Map(),
  comboBucket: [],
  comboUntil: 0,
  isDemo: false,
};

let tts = createTts({ enabled: true });
let lastFrame = performance.now();

const $ = (id) => document.getElementById(id);
const fillBar = $('fill-bar');
const pressureBar = $('pressure-bar');
const pctLabel = $('pct-label');
const hunterCount = $('hunter-count');
const orbitLayer = $('orbit-layer');
const chest = $('chest');
const comboFlash = $('combo-flash');
const topList = $('top-list');
const feed = $('feed');
const victory = $('victory');
const victorySub = $('victory-sub');
const roundEl = $('round');
const statusEl = $('status');
const demoHint = $('demo-hint');
const ttsToggle = $('tts-toggle');
const goalHint = $('goal-hint');

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

function pushFeed(html) {
  if (!feed) return;
  const li = document.createElement('li');
  li.innerHTML = html;
  feed.prepend(li);
  while (feed.children.length > 5) feed.lastChild?.remove();
}

function getComboMult() {
  return Date.now() < state.comboUntil ? COMBO_MULT : 1;
}

function trackCombo(likes) {
  const now = Date.now();
  state.comboBucket.push({ t: now, n: likes });
  state.comboBucket = state.comboBucket.filter((x) => now - x.t < COMBO_WINDOW);
  const total = state.comboBucket.reduce((s, x) => s + x.n, 0);
  if (total >= COMBO_LIKES && now >= state.comboUntil) {
    state.comboUntil = now + 5000;
    comboFlash?.classList.remove('hidden');
    setTimeout(() => comboFlash?.classList.add('hidden'), 1200);
    pushFeed('🔥 <strong>¡COMBO x2 en el cofre!</strong>');
    tts.speakRaw('¡Combo activado! Doble poder en el cofre.');
  }
}

function addContribution(user, amount) {
  if (!user) return;
  state.contributions.set(user, (state.contributions.get(user) || 0) + amount);
}

function updateTop() {
  if (!topList) return;
  const top = [...state.contributions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  topList.innerHTML = top
    .map(([user, amt], i) => {
      const name = state.hunters.get(user)?.nickname || user;
      return `<li><span>${i + 1}. ${escapeHtml(name)}</span><span>+${amt.toFixed(1)}</span></li>`;
    })
    .join('');
}

function renderHud() {
  const p = Math.min(GOAL, Math.max(0, state.progress));
  if (fillBar) fillBar.style.width = `${p}%`;
  if (pctLabel) pctLabel.textContent = `${Math.floor(p)}%`;
  if (pressureBar) pressureBar.style.width = `${state.warmth}%`;
  if (hunterCount) hunterCount.textContent = `${state.hunters.size} cazadores`;
  if (goalHint) {
    goalHint.textContent =
      p >= 90 ? '¡Casi! ¡Un último empujón!' : '¡Lleguen al 100% para abrir el cofre!';
  }
}

function layoutHunters() {
  if (!orbitLayer) return;
  const hunters = [...state.hunters.values()];
  const cx = orbitLayer.clientWidth / 2 || 400;
  const cy = orbitLayer.clientHeight / 2 || 190;
  const radius = Math.min(cx, cy) * 0.72;

  hunters.forEach((h, i) => {
    const angle = (i / hunters.length) * Math.PI * 2 + performance.now() * 0.0002;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (h.el) {
      h.el.style.left = `${x}px`;
      h.el.style.top = `${y}px`;
    }
  });
}

function joinHunter(user, nickname, avatar) {
  if (state.hunters.has(user) || state.hunters.size >= MAX_HUNTERS) return;

  const el = document.createElement('div');
  el.className = 'hunter-orb';
  el.title = nickname || user;

  if (avatar) {
    const img = document.createElement('img');
    img.src = avatar;
    img.alt = nickname;
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      img.remove();
      const s = document.createElement('span');
      s.textContent = (nickname || user).charAt(0).toUpperCase();
      el.appendChild(s);
    };
    el.appendChild(img);
  } else {
    const s = document.createElement('span');
    s.textContent = (nickname || user).charAt(0).toUpperCase();
    el.appendChild(s);
  }

  orbitLayer?.appendChild(el);
  state.hunters.set(user, { nickname: nickname || user, avatar, el });
  renderHud();
  layoutHunters();
  pushFeed(`🪙 <strong>${escapeHtml(nickname || user)}</strong> se unió a la misión`);
  tts.speakRaw(
    `¡${(nickname || user).replace(/[^\w\sáéíóúñü]/gi, '').slice(0, 28)} se unió al cofre! Dale tap tap.`
  );
}

function burstCoins() {
  if (!chest) return;
  const rect = chest.getBoundingClientRect();
  const parent = chest.closest('.chest-zone');
  const pr = parent?.getBoundingClientRect();
  if (!pr) return;
  for (let i = 0; i < 24; i++) {
    const c = document.createElement('span');
    c.className = 'coin-burst';
    c.textContent = ['🪙', '✨', '💎', '⭐'][i % 4];
    c.style.left = `${rect.left - pr.left + rect.width / 2 + (Math.random() - 0.5) * 80}px`;
    c.style.top = `${rect.top - pr.top + rect.height / 2}px`;
    parent.appendChild(c);
    setTimeout(() => c.remove(), 1100);
  }
}

function openChest() {
  if (state.frozen) return;
  state.frozen = true;
  chest?.classList.add('open');
  burstCoins();
  victory?.classList.remove('hidden');
  if (victorySub) victorySub.textContent = `${state.hunters.size} cazadores · ronda ${state.round}`;

  const topName = [...state.contributions.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topName) {
    const [user] = topName;
    const nick = state.hunters.get(user)?.nickname || user;
    tts.speakRaw(`¡Cofre abierto! Gracias a todos. MVP del cofre: ${nick}.`);
  } else {
    tts.speakRaw('¡Cofre abierto! El chat lo logró juntos. Nueva ronda pronto.');
  }

  pushFeed('🎉 <strong>¡COFRE ABIERTO!</strong>');

  setTimeout(resetRound, VICTORY_MS);
}

function resetRound() {
  state.progress = 0;
  state.warmth = 100;
  state.frozen = false;
  state.round += 1;
  state.contributions.clear();
  state.comboBucket = [];
  state.comboUntil = 0;
  if (roundEl) roundEl.textContent = String(state.round);

  chest?.classList.remove('open');
  victory?.classList.add('hidden');

  for (const h of state.hunters.values()) h.el?.remove();
  state.hunters.clear();

  renderHud();
  updateTop();
}

function applyFill(amount, source, user, extra = {}) {
  if (state.frozen || amount <= 0) return;

  const mult = source === 'like' ? getComboMult() : 1;
  const gain = amount * mult;
  state.progress = Math.min(GOAL, state.progress + gain);
  state.warmth = Math.min(100, state.warmth + gain * 0.5);
  addContribution(user, gain);

  if (source === 'like') trackCombo(extra.likeCount || 1);
  if (source === 'gift') {
    chest?.classList.remove('shake');
    void chest?.offsetWidth;
    chest?.classList.add('shake');
    burstCoins();
    const nick = state.hunters.get(user)?.nickname || user || 'alguien';
    pushFeed(`🎁 <strong>${escapeHtml(nick)}</strong> — lluvia de oro`);
    tts.speakRaw(`¡${nick} mandó un regalo! El cofre avanza muchísimo.`);
  }

  renderHud();
  updateTop();

  if (state.progress >= GOAL) openChest();
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!state.frozen && state.progress > 0) {
    state.warmth = Math.max(0, state.warmth - DECAY_PER_SEC * dt * 100);
    if (state.warmth <= 0) {
      state.progress = Math.max(0, state.progress - DECAY_PER_SEC * dt * 80);
    }
    renderHud();
  }

  layoutHunters();
  requestAnimationFrame(tick);
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
        break;
      case 'status':
        if (msg.state === 'connected') setStatus('Live en vivo', true);
        break;
      case 'cofre_join':
        joinHunter(msg.user, msg.nickname, msg.avatar);
        break;
      case 'cofre_fill':
        applyFill(msg.amount, msg.source, msg.user, msg);
        break;
      case 'tts':
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

function demoKeys(e) {
  if (!state.isDemo) return;
  const u = `hero_${Math.floor(Math.random() * 900)}`;
  if (e.key === 'c' || e.key === 'C') joinHunter(u, u, null);
  else if (e.key === 'l' || e.key === 'L') applyFill(0.35, 'like', u, { likeCount: 1 });
  else if (e.key === 'g' || e.key === 'G') applyFill(12, 'gift', u, { giftName: 'Rosa' });
}

function scaleStage() {
  const stage = $('app');
  if (!stage) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
  requestAnimationFrame(layoutHunters);
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
renderHud();
scaleStage();
window.addEventListener('resize', scaleStage);
window.addEventListener('keydown', demoKeys);
connectWs();
requestAnimationFrame(tick);
