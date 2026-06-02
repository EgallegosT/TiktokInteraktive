import { createTts } from '../../race/js/tts.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;

const HOLD_REIGN_MS = 45000;
const MAX_CONTENDERS = 32;
const ROUND_RESET_MS = 7000;
const COMBO_WINDOW = 3000;
const COMBO_LIKES = 7;
const COMBO_MULT = 2;
const IDLE_PROMPT_MS = 26000;
const IDLE_COOLDOWN_MS = 48000;

const WELCOME_LINES = [
  '¡Bienvenidos al Rey de la Colina!',
  'Comenta rey para pelear por la corona. Dale tap tap para sumar poder.',
  'Si superas al rey en puntos, le robas la corona al instante. ¡Mantén el trono cuarenta y cinco segundos para ganar el reinado!',
];

const IDLE_LINES = [
  '¡Comenta rey y sube a la colina!',
  '¡Dale tap tap si ya estás en la pelea por la corona!',
  '¿Quién roba el trono hoy? ¡Empujen con likes!',
];

const state = {
  contenders: new Map(),
  kingUser: null,
  kingSince: 0,
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
let lastFrame = performance.now();

const $ = (id) => document.getElementById(id);
const kingSlot = $('king-slot');
const kingName = $('king-name');
const kingScore = $('king-score');
const reignTimer = $('reign-timer');
const challengerEl = $('challenger');
const gapBar = $('gap-bar');
const gapLabel = $('gap-label');
const leaderboard = $('leaderboard');
const coronaFlash = $('corona-flash');
const comboFlash = $('combo-flash');
const giftBanner = $('gift-banner');
const narratorBanner = $('narrator-banner');
const feed = $('feed');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const roundEl = $('round');
const hillN = $('hill-n');
const statusEl = $('status');
const demoHint = $('demo-hint');
const ttsToggle = $('tts-toggle');
const stage = $('app');

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
    }, i * 5500);
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

function getSorted() {
  return [...state.contenders.entries()].sort((a, b) => b[1].score - a[1].score);
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
    state.comboUntil.set(user, now + 5000);
    comboFlash?.classList.remove('hidden');
    setTimeout(() => comboFlash?.classList.add('hidden'), 1200);
    pushFeed('🔥 <strong>¡COMBO x2 en la colina!</strong>');
  }
}

function avatarImg(avatar, nickname, user, className = '') {
  const letter = (nickname || user || '?').charAt(0).toUpperCase();
  const cls = className ? ` class="${className}"` : '';
  if (avatar) {
    return `<img${cls} src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" />`;
  }
  return `<span${cls} style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#444;font-size:2rem;font-weight:900;color:#fde047;border-radius:50%">${letter}</span>`;
}

function showCoronation(nickname) {
  coronaFlash?.classList.remove('hidden');
  stage?.classList.add('shake-crown');
  setTimeout(() => {
    coronaFlash?.classList.add('hidden');
    stage?.classList.remove('shake-crown');
  }, 1600);
  tts.speakRaw(`¡Nuevo rey de la colina! ¡${nickname} conquistó la corona!`);
}

function setKing(user, isNewKing) {
  const prev = state.kingUser;
  state.kingUser = user;
  if (user && (isNewKing || prev !== user)) {
    state.kingSince = Date.now();
  }
  if (!user) state.kingSince = 0;
}

function updateKingUI() {
  const sorted = getSorted();
  const top = sorted[0];
  const king = state.kingUser ? state.contenders.get(state.kingUser) : null;

  if (hillN) hillN.textContent = String(state.contenders.size);

  if (!king || !state.kingUser) {
    kingSlot?.classList.add('empty');
    kingSlot.innerHTML = '<p class="empty-msg">Comenta <strong>rey</strong><br/>para conquistar</p>';
    if (kingName) kingName.textContent = '—';
    if (kingScore) kingScore.textContent = '0 pts';
    if (reignTimer) reignTimer.textContent = 'Mantén la corona 45s';
  } else {
    kingSlot?.classList.remove('empty');
    kingSlot.innerHTML = `
      <div class="king-avatar-wrap">
        <span class="king-crown">👑</span>
        ${avatarImg(king.avatar, king.nickname, king.user, 'king-avatar')}
      </div>
    `;

    if (kingName) kingName.textContent = king.nickname;
    if (kingScore) kingScore.textContent = `${Math.floor(king.score)} pts`;
  }

  const challenger = sorted.find(([u]) => u !== state.kingUser);
  if (challenger && king) {
    const [, c] = challenger;
    const gap = Math.max(0, king.score - c.score);
    const catchPct = king.score > 0 ? Math.min(100, (c.score / king.score) * 100) : 0;
    if (gapBar) gapBar.style.width = `${catchPct}%`;
    if (gapLabel) gapLabel.textContent = `${c.nickname} a ${Math.ceil(gap)} pts de robar la corona`;
    challengerEl?.classList.remove('empty');
    challengerEl.innerHTML = `
      ${avatarImg(c.avatar, c.nickname, c.user)}
      <div class="challenger-info">
        <strong>${escapeHtml(c.nickname)}</strong>
        <span>${Math.floor(c.score)} pts</span>
      </div>
    `;
  } else {
    challengerEl?.classList.add('empty');
    challengerEl.innerHTML = '<span class="chase-empty">Sin retador… ¡sube tú!</span>';
    if (gapBar) gapBar.style.width = '0%';
    if (gapLabel) gapLabel.textContent = '—';
  }

  if (leaderboard) {
    leaderboard.innerHTML = sorted
      .slice(0, 6)
      .map(([user, c], i) => {
        const isKing = user === state.kingUser;
        return `<li class="${isKing ? 'is-king' : ''}">
          ${avatarImg(c.avatar, c.nickname, user)}
          <span>${i + 1}. ${escapeHtml(c.nickname)}${isKing ? ' 👑' : ''}</span>
          <span>${Math.floor(c.score)}</span>
        </li>`;
      })
      .join('');
  }
}

function checkKingChange() {
  const sorted = getSorted();
  if (!sorted.length) {
    setKing(null);
    return;
  }

  const [topUser, top] = sorted[0];
  const currentKing = state.kingUser ? state.contenders.get(state.kingUser) : null;

  if (!state.kingUser || !currentKing || top.score > currentKing.score) {
    const isNew = state.kingUser !== topUser;
    setKing(topUser, true);
    if (isNew) {
      showCoronation(top.nickname);
      pushFeed(`👑 <strong>${escapeHtml(top.nickname)}</strong> ¡robó la corona!`);
    }
  }
}

function joinContender(msg) {
  const user = msg.user;
  if (!user || state.contenders.has(user) || state.contenders.size >= MAX_CONTENDERS) return;

  touchActivity();
  state.contenders.set(user, {
    user,
    nickname: msg.nickname || user,
    avatar: msg.avatar || null,
    score: 0,
  });

  if (!state.kingUser) {
    setKing(user, true);
    pushFeed(`👑 <strong>${escapeHtml(msg.nickname || user)}</strong> toma el trono vacío`);
    tts.speakRaw(`¡${msg.nickname || user} es el primer rey de la colina! Dale tap tap.`);
  } else {
    pushFeed(`🏔️ <strong>${escapeHtml(msg.nickname || user)}</strong> sube a la colina`);
    tts.speakRaw(`¡${msg.nickname || user} entra a la colina! Supera al rey en puntos.`);
  }

  updateKingUI();
}

function applyPoints(user, amount, source, extra = {}) {
  const c = state.contenders.get(user);
  if (!c || state.frozen || amount <= 0) return;
  touchActivity();

  const mult = source === 'like' ? getComboMult(user) : 1;
  c.score += amount * mult;

  if (source === 'like') trackCombo(user, extra.likeCount || 1);

  if (extra.nitro) {
    giftBanner?.classList.remove('hidden');
    setTimeout(() => giftBanner?.classList.add('hidden'), 1100);
    pushFeed(`🎁 <strong>${escapeHtml(c.nickname)}</strong> — poder real`);
    tts.speakRaw(`¡Regalo de ${c.nickname}! Empuje real hacia la corona.`);
  }

  checkKingChange();
  updateKingUI();
}

function winReign() {
  if (state.frozen || !state.kingUser) return;
  const king = state.contenders.get(state.kingUser);
  if (!king) return;

  state.frozen = true;
  touchActivity();

  if (overlayTitle) overlayTitle.textContent = '¡REINADO LEGENDARIO!';
  if (overlaySub) {
    overlaySub.textContent = `${king.nickname} mantuvo la corona 45 segundos · reinado ${state.round}`;
  }
  overlay?.classList.remove('hidden');

  pushFeed(`🏆 <strong>${escapeHtml(king.nickname)}</strong> — ¡reinado legendario!`);
  tts.speakRaw(
    `¡Reinado legendario! ${king.nickname} defendió la corona cuarenta y cinco segundos. Nueva colina.`
  );

  setTimeout(resetRound, ROUND_RESET_MS);
}

function resetRound() {
  state.frozen = false;
  state.round += 1;
  state.contenders.clear();
  state.kingUser = null;
  state.kingSince = 0;
  state.comboUntil.clear();
  state.likeBuckets.clear();

  if (roundEl) roundEl.textContent = String(state.round);
  overlay?.classList.add('hidden');
  updateKingUI();
  touchActivity();
}

function tick(now) {
  const dt = now - lastFrame;
  lastFrame = now;

  if (!state.frozen && state.kingUser && state.kingSince > 0) {
    const held = now - state.kingSince;
    const left = Math.max(0, HOLD_REIGN_MS - held);
    const sec = Math.ceil(left / 1000);

    if (reignTimer) {
      reignTimer.textContent =
        left > 0 ? `Corona segura en ${sec}s` : '¡Reinado completado!';
      reignTimer.classList.toggle('urgent', left > 0 && left < 12000);
    }

    if (held >= HOLD_REIGN_MS) winReign();
  } else if (reignTimer && state.kingUser) {
    reignTimer.textContent = 'Defiende la corona 45s';
    reignTimer.classList.remove('urgent');
  }

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
        setTimeout(playWelcome, 1200);
        break;
      case 'status':
        if (msg.state === 'connected') {
          setStatus('Live en vivo', true);
          if (!welcomePlayed) setTimeout(playWelcome, 1200);
        }
        break;
      case 'hill_join':
        joinContender(msg);
        break;
      case 'hill_points':
        applyPoints(msg.user, msg.amount, msg.source, msg);
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
  const id = `hill_${Date.now() % 100000}`;
  joinContender({
    user: id,
    nickname: `Guerrero_${id.slice(-4)}`,
    avatar: null,
  });
}

function demoKeys(e) {
  if (!state.isDemo) return;
  const u = [...state.contenders.keys()].pop() || `hill_${Date.now()}`;
  if (e.key === 'r' || e.key === 'R') demoJoin();
  else if (e.key === 'l' || e.key === 'L') {
    if (state.contenders.size === 0) demoJoin();
    applyPoints(u, 12, 'like', { likeCount: 1 });
  } else if (e.key === 'g' || e.key === 'G') {
    if (state.contenders.size === 0) demoJoin();
    applyPoints(u, 55, 'gift', { nitro: true });
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
updateKingUI();
scaleStage();
window.addEventListener('resize', scaleStage);
window.addEventListener('keydown', demoKeys);
setInterval(promptIdle, 4000);
connectWs();
requestAnimationFrame(tick);
