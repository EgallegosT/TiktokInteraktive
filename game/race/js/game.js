import { createTts } from './tts.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;
const IMG_TEAM_1 = '/assets/images/1.jpg';
const IMG_TEAM_2 = '/assets/images/2.jpg';
const FINISH = 88;
const ROUND_RESET_MS = 6000;

const COMBO_LIKES = 5;
const COMBO_WINDOW_MS = 3000;
const COMBO_DURATION_MS = 5000;
const COMBO_MULT = 2;
const SLOW_DURATION_MS = 2000;
const SLOW_PULL = 7;
const SLOW_POWER_MULT = 0.3;

const IDLE_PROMPT_MS = 26000;
const IDLE_PROMPT_COOLDOWN_MS = 48000;
const NARRATOR_BANNER_MS = 5500;

const WELCOME_LINES = [
  '¡Bienvenidos a la Carrera de Estrellas en vivo!',
  'Comenta uno para DR SIMI, equipo azul. O dos para GOKU, equipo rojo.',
  'Dale tap tap para empujar. Los regalos son turbo y frenan al rival.',
];

const IDLE_LINES = [
  '¡El chat puede más! Dale tap tap a tu equipo favorito.',
  '¡Nadie empuja! Comenta uno o dos y luego tap tap.',
  '¡Vamos! Unos likes y la carrera se pone buenísima.',
  '¡Vamos! ¡Vamos! que mis cuentas no se pagan solas XD.',
  '¿Quién gana hoy? Empuja con tap tap o manda un regalo turbo.',
  '¡La meta está cerca! No dejen de dar tap tap.',
];

const state = {
  blue: 4,
  red: 4,
  members: { 1: new Set(), 2: new Set() },
  round: 1,
  frozen: false,
  demoTeam: 1,
  isDemo: false,
  streaks: { 1: 0, 2: 0 },
};

const likeBuckets = { 1: [], 2: [] };
const comboUntil = { 1: 0, 2: 0 };
const slowUntil = { 1: 0, 2: 0 };

const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');
const runnerBlue = $('#runner-blue');
const runnerRed = $('#runner-red');
const trailBlue = $('#trail-blue');
const trailRed = $('#trail-red');
const countBlue = $('#count-blue');
const countRed = $('#count-red');
const pctBlue = $('#pct-blue');
const pctRed = $('#pct-red');
const streakBlue = $('#streak-blue');
const streakRed = $('#streak-red');
const feed = $('#feed');
const winner = $('#winner');
const winnerTeam = $('#winner-team');
const winnerImg = $('#winner-img');
const nitroBanner = $('#nitro-banner');
const comboBanner = $('#combo-banner');
const slowBanner = $('#slow-banner');
const roundLabel = $('#round-label');
const demoHint = $('#demo-hint');
const laneBlue = document.querySelector('.lane-blue');
const laneRed = document.querySelector('.lane-red');
const ttsToggle = $('#tts-toggle');
const narratorBanner = $('#narrator-banner');

let tts = createTts({ enabled: true });
let lastActivity = Date.now();
let lastIdlePrompt = 0;
let welcomePlayed = false;
let narratorBannerTimer = null;

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
    ttsToggle.className = 'tts-pill unsupported';
    ttsToggle.disabled = true;
    return;
  }
  const on = ttsToggle.classList.contains('on');
  ttsToggle.textContent = on ? '🔊 Voz ON' : '🔇 Voz OFF';
  ttsToggle.className = `tts-pill ${on ? 'on' : 'off'}`;
  tts.setEnabled(on);
}

function onTtsMessage(msg) {
  touchActivity();
  const spoke = tts.enqueue(msg.nickname || msg.user, msg.comment);
  if (spoke) {
    pushFeed(
      `🔊 <strong>${escapeHtml(msg.nickname || msg.user)}</strong>: «${escapeHtml(msg.comment.slice(0, 60))}»`,
      'join'
    );
  }
}

if (ttsToggle) {
  ttsToggle.addEventListener('click', () => {
    if (!tts.isSupported()) return;
    ttsToggle.classList.toggle('on');
    updateTtsButton();
  });
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function teamFullName(team) {
  return team === 1 ? 'EQUIPO AZUL' : 'EQUIPO ROJO';
}

function teamShort(team) {
  return team === 1 ? 'AZUL' : 'ROJO';
}

function progressPct(pos) {
  return Math.round(((pos - 4) / (FINISH - 4)) * 100);
}

function setStatus(text, kind = '') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status-pill ${kind}`;
}

function touchActivity() {
  lastActivity = Date.now();
}

function showNarratorBanner(text) {
  if (!narratorBanner) return;
  narratorBanner.textContent = text;
  narratorBanner.classList.remove('hidden');
  clearTimeout(narratorBannerTimer);
  narratorBannerTimer = setTimeout(() => {
    narratorBanner.classList.add('hidden');
  }, NARRATOR_BANNER_MS);
}

function playWelcome() {
  if (welcomePlayed) return;
  welcomePlayed = true;
  WELCOME_LINES.forEach((line, i) => {
    setTimeout(() => {
      tts.speakRaw(line);
      if (i === 0) showNarratorBanner(line);
    }, i * 5200);
  });
}

function promptIdleTap() {
  if (state.frozen) return;
  const now = Date.now();
  if (now - lastActivity < IDLE_PROMPT_MS) return;
  if (now - lastIdlePrompt < IDLE_PROMPT_COOLDOWN_MS) return;
  lastIdlePrompt = now;
  const line = IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
  tts.speakRaw(line);
  showNarratorBanner(line);
  pushFeed('📢 <strong>Narrador:</strong> ¡Dale tap tap al chat!', 'join');
}

function getComboMult(team) {
  return Date.now() < comboUntil[team] ? COMBO_MULT : 1;
}

function getSlowMult(team) {
  return Date.now() < slowUntil[team] ? SLOW_POWER_MULT : 1;
}

function updateSlowVisuals() {
  const now = Date.now();
  laneBlue.classList.toggle('slowed', now < slowUntil[1]);
  laneRed.classList.toggle('slowed', now < slowUntil[2]);
}

function updateStreakUI() {
  for (const [team, el] of [
    [1, streakBlue],
    [2, streakRed],
  ]) {
    const n = state.streaks[team];
    if (n >= 2) {
      el.textContent = `🔥 ${n} victorias seguidas`;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }
}

function render() {
  countBlue.textContent = state.members[1].size;
  countRed.textContent = state.members[2].size;
  pctBlue.textContent = `${progressPct(state.blue)}%`;
  pctRed.textContent = `${progressPct(state.red)}%`;

  runnerBlue.style.left = `${state.blue}%`;
  runnerRed.style.left = `${state.red}%`;
  trailBlue.style.width = `${state.blue}%`;
  trailRed.style.width = `${state.red}%`;

  laneBlue.classList.toggle('leading', state.blue > state.red);
  laneRed.classList.toggle('leading', state.red > state.blue);
  laneBlue.classList.toggle('combo-active', Date.now() < comboUntil[1]);
  laneRed.classList.toggle('combo-active', Date.now() < comboUntil[2]);

  updateSlowVisuals();
  updateStreakUI();
}

function pushFeed(html, type = '') {
  const li = document.createElement('li');
  li.innerHTML = html;
  if (type) li.classList.add(`feed-${type}`);
  feed.prepend(li);
  while (feed.children.length > 4) feed.lastChild?.remove();
}

function showCombo(team) {
  comboBanner.textContent = `🔥 ¡COMBO x2 ${teamShort(team)}!`;
  comboBanner.className = `combo-banner team-${team === 1 ? 'blue' : 'red'}`;
  comboBanner.classList.remove('hidden');
  setTimeout(() => comboBanner.classList.add('hidden'), COMBO_DURATION_MS);
}

function showNitro(team, giftName) {
  const label = teamFullName(team);
  nitroBanner.textContent = giftName
    ? `⚡ ¡TURBO ${label}! · ${giftName}`
    : `⚡ ¡TURBO ${label}!`;
  nitroBanner.classList.remove('hidden');
  runnerBlue.classList.toggle('nitro', team === 1);
  runnerRed.classList.toggle('nitro', team === 2);
  setTimeout(() => {
    nitroBanner.classList.add('hidden');
    runnerBlue.classList.remove('nitro');
    runnerRed.classList.remove('nitro');
  }, 1400);
}

function showSlow(team) {
  slowBanner.textContent = `🧊 ¡${teamFullName(team)} FRENADO!`;
  slowBanner.className = `slow-banner team-${team === 1 ? 'blue' : 'red'}`;
  slowBanner.classList.remove('hidden');
  setTimeout(() => slowBanner.classList.add('hidden'), SLOW_DURATION_MS);
}

function trackLikeCombo(team, likeCount = 1) {
  const now = Date.now();
  likeBuckets[team].push({ t: now, n: likeCount });
  likeBuckets[team] = likeBuckets[team].filter((x) => now - x.t < COMBO_WINDOW_MS);
  const total = likeBuckets[team].reduce((s, x) => s + x.n, 0);
  if (total >= COMBO_LIKES && now >= comboUntil[team]) {
    comboUntil[team] = now + COMBO_DURATION_MS;
    showCombo(team);
    pushFeed(`🔥 <strong>COMBO x2</strong> para el <strong>${teamFullName(team)}</strong>`, 'like');
  }
}

function applySlow(team, user) {
  if (state.frozen) return;
  touchActivity();
  const key = team === 1 ? 'blue' : 'red';
  state[key] = clamp(state[key] - SLOW_PULL, 4, FINISH);
  slowUntil[team] = Date.now() + SLOW_DURATION_MS;
  render();
  showSlow(team);
  const name = escapeHtml(user || 'alguien');
  pushFeed(`🧊 Regalo rival frena al <strong>${teamFullName(team)}</strong> (${name})`, 'gift');
}

function checkWinner() {
  if (state.frozen) return;
  let win = null;
  if (state.blue >= FINISH) win = 1;
  else if (state.red >= FINISH) win = 2;
  if (!win) return;

  touchActivity();
  state.frozen = true;
  state.streaks[win] += 1;
  state.streaks[win === 1 ? 2 : 1] = 0;

  winnerTeam.textContent = teamFullName(win);
  winnerTeam.className = `winner-team ${win === 1 ? 'blue' : 'red'}`;
  if (winnerImg) winnerImg.src = win === 1 ? IMG_TEAM_1 : IMG_TEAM_2;
  winner.classList.remove('hidden');

  const streakMsg =
    state.streaks[win] >= 2
      ? ` · racha de ${state.streaks[win]}`
      : '';
  pushFeed(
    `🏆 <strong>${teamFullName(win)}</strong> llegó primero${streakMsg}`,
    'win'
  );
  updateStreakUI();
  tts.speakRaw(
    `¡Ganó el ${teamFullName(win)}!${state.streaks[win] >= 2 ? ` Racha de ${state.streaks[win]} victorias.` : ''} Nueva carrera en unos segundos.`
  );

  setTimeout(resetRound, ROUND_RESET_MS);
}

function resetRound() {
  state.blue = 4;
  state.red = 4;
  state.frozen = false;
  state.round += 1;
  roundLabel.textContent = `Carrera ${state.round}`;
  winner.classList.add('hidden');
  likeBuckets[1] = [];
  likeBuckets[2] = [];
  touchActivity();
  render();
}

function applyBoost(team, amount, source, user, extra = {}) {
  if (state.frozen || !team) return;
  touchActivity();

  const mult = getComboMult(team) * getSlowMult(team);
  const key = team === 1 ? 'blue' : 'red';
  state[key] = clamp(state[key] + amount * 0.35 * mult, 4, FINISH);
  render();
  checkWinner();

  const name = escapeHtml(user || 'alguien');
  const label = teamFullName(team);

  if (source === 'like') {
    trackLikeCombo(team, extra.likeCount || 1);
    const comboTag = mult >= COMBO_MULT ? ' (combo)' : '';
    pushFeed(
      `👆 <strong>${name}</strong> empujó al <strong>${label}</strong>${comboTag}`,
      'like'
    );
  } else if (source === 'gift') {
    showNitro(team, extra.giftName);
    pushFeed(`🎁 <strong>${name}</strong> mandó turbo al <strong>${label}</strong>`, 'gift');
  } else if (source === 'follow') {
    pushFeed(`❤️ <strong>${name}</strong> se unió al <strong>${label}</strong>`, 'join');
  }
}

function onTeamJoin(user, team, nickname) {
  touchActivity();
  const wasNew = !state.members[1].has(user) && !state.members[2].has(user);
  state.members[team].add(user);
  const other = team === 1 ? 2 : 1;
  state.members[other].delete(user);
  render();
  const display = nickname || user;
  pushFeed(
    `✅ <strong>${escapeHtml(display)}</strong> juega en <strong>${teamFullName(team)}</strong>`,
    'join'
  );
  if (wasNew && state.members[1].size + state.members[2].size <= 8) {
    const artist = team === 1 ? 'Doctor Simi' : 'Goku';
    tts.speakRaw(`¡${display.replace(/[^\w\sáéíóúñü]/gi, '').slice(0, 24)} se unió a ${artist}! Dale tap tap.`);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function connectWs() {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => setStatus('Conectado', 'ok');

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
        if (msg.demoMode) setStatus('Modo demo', 'demo');
        else if (msg.connected) setStatus('Live en vivo', 'ok');
        else setStatus('Esperando live…', 'err');
        setTimeout(playWelcome, 1200);
        break;
      case 'tts':
        onTtsMessage(msg);
        break;
      case 'status':
        if (msg.state === 'connected') {
          setStatus('Live en vivo', 'ok');
          if (!welcomePlayed) setTimeout(playWelcome, 1200);
        } else if (msg.state === 'demo') setStatus('Modo demo', 'demo');
        else if (msg.state === 'reconnecting') setStatus('Reconectando…');
        else if (msg.state === 'disconnected') setStatus('Live pausado', 'err');
        else if (msg.state === 'error') setStatus(msg.message || 'Sin conexión', 'err');
        break;
      case 'team_join':
        onTeamJoin(msg.user, msg.team, msg.nickname);
        break;
      case 'boost':
        applyBoost(msg.team, msg.amount, msg.source, msg.user, msg);
        break;
      case 'slow':
        applySlow(msg.team, msg.user);
        break;
      default:
        break;
    }
  };

  ws.onclose = () => {
    setStatus('Sin servidor', 'err');
    setTimeout(connectWs, 2000);
  };

  ws.onerror = () => setStatus('Error de conexión', 'err');
}

function demoKeys(e) {
  if (!state.isDemo) return;
  const u = `jugador_${Math.floor(Math.random() * 900 + 100)}`;
  if (e.key === '1') {
    state.demoTeam = 1;
    onTeamJoin(u, 1);
  } else if (e.key === '2') {
    state.demoTeam = 2;
    onTeamJoin(u, 2);
  } else if (e.key === 'l' || e.key === 'L') {
    applyBoost(state.demoTeam, 12, 'like', u, { likeCount: 1 });
  } else if (e.key === 'g' || e.key === 'G') {
    applyBoost(state.demoTeam, 45, 'gift', u, { giftName: 'Rosa' });
    applySlow(state.demoTeam === 1 ? 2 : 1, u);
  } else if (e.key === 't' || e.key === 'T') {
    onTtsMessage({
      nickname: 'fan_seguidor',
      comment: 'vamos equipo vamos con todo que ganamos esta carrera',
    });
  }
}

function scaleStage() {
  const stage = $('#app');
  if (!stage) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}

setInterval(() => {
  if (!state.frozen) render();
}, 200);

setInterval(promptIdleTap, 4000);

/* Chrome/Edge: la voz requiere un clic en la página una vez */
document.addEventListener(
  'click',
  () => {
    if (!window.speechSynthesis) return;
    const unlock = new SpeechSynthesisUtterance('');
    unlock.volume = 0.01;
    window.speechSynthesis.speak(unlock);
  },
  { once: true }
);

initTts();
render();
scaleStage();
window.addEventListener('resize', scaleStage);
window.addEventListener('keydown', demoKeys);
connectWs();
