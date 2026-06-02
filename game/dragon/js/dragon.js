import { createTts } from '../../race/js/tts.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;

const BASE_HP = 1200;
const BASE_RAGE_PER_SEC = 3.2;
/** Vida extra por cada héroe registrado (atacar) */
const HP_PER_HERO = 0.24;
/** Furia extra por héroe */
const RAGE_PER_HERO = 0.11;
/** Armadura: menos daño efectivo con más héroes */
const ARMOR_PER_HERO = 0.065;
const RAGE_LIKE_RELIEF = 0.35;
const RAGE_GIFT_RELIEF = 4;
const COMBO_WINDOW = 3000;
const COMBO_HITS = 10;
const COMBO_MULT = 2;
const MAX_HEROES = 24;
const END_MS = 7500;

const state = {
  hp: BASE_HP,
  maxHp: BASE_HP,
  ragePerSec: BASE_RAGE_PER_SEC,
  damageMult: 1,
  raidTier: 'Patrulla',
  rage: 0,
  round: 1,
  frozen: false,
  heroes: new Map(),
  damage: new Map(),
  comboBucket: [],
  comboUntil: 0,
  isDemo: false,
};

let tts = createTts({ enabled: true });
let lastFrame = performance.now();
let scaleFactor = 1;

const $ = (id) => document.getElementById(id);
const hpBar = $('hp-bar');
const rageBar = $('rage-bar');
const hpPct = $('hp-pct');
const ragePct = $('rage-pct');
const heroN = $('hero-n');
const heroesLayer = $('heroes-layer');
const fxLayer = $('fx-layer');
const dragon = $('dragon');
const dragonMood = $('dragon-mood');
const critBanner = $('crit-banner');
const comboFlash = $('combo-flash');
const dmgList = $('dmg-list');
const feed = $('feed');
const overlay = $('overlay');
const overlayEmoji = $('overlay-emoji');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const roundEl = $('round');
const diffLabel = $('diff-label');
const statusEl = $('status');
const demoHint = $('demo-hint');
const ttsToggle = $('tts-toggle');
const arena = $('arena');
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

function pushFeed(html) {
  if (!feed) return;
  const li = document.createElement('li');
  li.innerHTML = html;
  feed.prepend(li);
  while (feed.children.length > 5) feed.lastChild?.remove();
}

function heroCount() {
  return state.heroes.size;
}

function raidTier(n) {
  if (n === 0) return 'Patrulla';
  if (n < 5) return 'Escuadra';
  if (n < 12) return 'Ejército';
  return 'Legión';
}

/** Escala dificultad según héroes: más jugadores = dragón más fuerte */
function recalcDifficulty(preserveHpRatio = false) {
  const n = heroCount();
  const hpMul = 1 + n * HP_PER_HERO;
  const rageMul = 1 + n * RAGE_PER_HERO;
  const armor = 1 / (1 + n * ARMOR_PER_HERO);

  const newMax = Math.floor(BASE_HP * hpMul);
  const prevMax = state.maxHp || BASE_HP;

  if (preserveHpRatio && prevMax > 0 && state.hp > 0) {
    const ratio = state.hp / prevMax;
    state.maxHp = newMax;
    state.hp = Math.max(1, Math.min(state.maxHp, Math.floor(state.maxHp * ratio)));
  } else {
    state.maxHp = newMax;
    state.hp = state.maxHp;
  }

  state.ragePerSec = BASE_RAGE_PER_SEC * rageMul;
  state.damageMult = armor;
  state.raidTier = raidTier(n);
}

function hpPercent() {
  return Math.max(0, (state.hp / state.maxHp) * 100);
}

function getComboMult() {
  return Date.now() < state.comboUntil ? COMBO_MULT : 1;
}

function trackCombo(hits) {
  const now = Date.now();
  state.comboBucket.push({ t: now, n: hits });
  state.comboBucket = state.comboBucket.filter((x) => now - x.t < COMBO_WINDOW);
  const total = state.comboBucket.reduce((s, x) => s + x.n, 0);
  if (total >= COMBO_HITS && now >= state.comboUntil) {
    state.comboUntil = now + 5000;
    comboFlash?.classList.remove('hidden');
    setTimeout(() => comboFlash?.classList.add('hidden'), 1200);
    pushFeed('🔥 <strong>¡COMBO x2 contra el dragón!</strong>');
    tts.speakRaw('¡Combo activado! Doble daño al dragón.');
  }
}

function addDamage(user, amount) {
  if (!user) return;
  state.damage.set(user, (state.damage.get(user) || 0) + amount);
}

function updateMood() {
  if (!dragonMood) return;
  const hp = hpPercent();
  const rage = state.rage;
  if (hp <= 15) dragonMood.textContent = '¡Está a punto de caer!';
  else if (rage >= 75) dragonMood.textContent = '¡VA A EXPLOTAR!';
  else if (rage >= 45) dragonMood.textContent = 'El dragón ruge con furia…';
  else if (hp <= 40) dragonMood.textContent = 'Sangra… pero contraataca';
  else dragonMood.textContent = 'El dragón observa al chat…';
}

function renderHud() {
  const hp = hpPercent();
  if (hpBar) hpBar.style.width = `${hp}%`;
  if (hpPct) hpPct.textContent = `${Math.floor(hp)}%`;
  if (rageBar) rageBar.style.width = `${Math.min(100, state.rage)}%`;
  if (ragePct) ragePct.textContent = `${Math.floor(state.rage)}%`;
  if (heroN) heroN.textContent = String(state.heroes.size);
  if (diffLabel) {
    const n = heroCount();
    const pctArmor = Math.round((1 - state.damageMult) * 100);
    diffLabel.textContent =
      n === 0
        ? 'Raid: patrulla (fácil)'
        : `Raid: ${state.raidTier} · nv.${(1 + n * HP_PER_HERO).toFixed(1)} · armadura ${pctArmor}%`;
  }

  dragon?.classList.toggle('enraged', state.rage >= 60);
  dragon?.classList.toggle('dying', hp <= 25);
  updateMood();
}

function updateTop() {
  if (!dmgList) return;
  const top = [...state.damage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  dmgList.innerHTML = top
    .map(([user, amt], i) => {
      const name = state.heroes.get(user)?.nickname || user;
      return `<li><span>${i + 1}. ${escapeHtml(name)}</span><span>${Math.floor(amt)}</span></li>`;
    })
    .join('');
}

function layoutHeroes() {
  if (!heroesLayer) return;
  const list = [...state.heroes.values()];
  const cx = heroesLayer.clientWidth / 2 || 500;
  const cy = heroesLayer.clientHeight / 2 || 220;
  const radius = Math.min(cx, cy) * 0.78;

  list.forEach((h, i) => {
    const angle = (i / Math.max(1, list.length)) * Math.PI * 2 + performance.now() * 0.00025;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (h.el) {
      h.el.style.left = `${x}px`;
      h.el.style.top = `${y}px`;
    }
  });
}

function spawnSlash(fromX, fromY) {
  if (!fxLayer || !arena) return;
  const rect = arena.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height * 0.48;
  const slash = document.createElement('div');
  slash.className = 'slash';
  const dx = cx - fromX;
  const dy = cy - fromY;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  slash.style.left = `${fromX}px`;
  slash.style.top = `${fromY}px`;
  slash.style.transform = `rotate(${angle}deg)`;
  fxLayer.appendChild(slash);
  setTimeout(() => slash.remove(), 450);
}

function spawnDmgPop(amount, crit) {
  if (!fxLayer || !arena) return;
  const pop = document.createElement('div');
  pop.className = `dmg-pop${crit ? ' crit' : ''}`;
  pop.textContent = crit ? `-${Math.floor(amount)}!` : `-${Math.floor(amount)}`;
  pop.style.left = `${arena.clientWidth / 2 + (Math.random() - 0.5) * 120}px`;
  pop.style.top = `${arena.clientHeight * 0.32}px`;
  fxLayer.appendChild(pop);
  setTimeout(() => pop.remove(), 900);
}

function joinHero(user, nickname, avatar) {
  if (state.heroes.has(user) || state.heroes.size >= MAX_HEROES) return;

  const el = document.createElement('div');
  el.className = 'hero-orb';
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

  heroesLayer?.appendChild(el);
  const prevN = heroCount();
  state.heroes.set(user, { nickname: nickname || user, avatar, el });
  recalcDifficulty(prevN > 0);
  renderHud();
  layoutHeroes();
  pushFeed(`⚔️ <strong>${escapeHtml(nickname || user)}</strong> se unió a la raid`);
  const n = heroCount();
  if (n === 5 || n === 12) {
    pushFeed(`🐉 <strong>¡El dragón se fortalece!</strong> Raid ${state.raidTier}`);
    tts.speakRaw(`¡Atención! El dragón sube a nivel ${state.raidTier}. ¡Más tap tap!`);
  } else {
    tts.speakRaw(
      `¡${(nickname || user).replace(/[^\w\sáéíóúñü]/gi, '').slice(0, 28)} ataca al dragón! Dale tap tap.`
    );
  }
}

function showCrit() {
  critBanner?.classList.remove('hidden');
  arena?.classList.add('shake-arena');
  setTimeout(() => {
    critBanner?.classList.add('hidden');
    arena?.classList.remove('shake-arena');
  }, 700);
}

function endBattle(victory) {
  if (state.frozen) return;
  state.frozen = true;

  overlay?.classList.remove('hidden', 'defeat');
  if (victory) {
    overlayEmoji.textContent = '🏆';
    overlayTitle.textContent = '¡DRAGÓN DERROTADO!';
    const mvp = [...state.damage.entries()].sort((a, b) => b[1] - a[1])[0];
    const mvpName = mvp
      ? state.heroes.get(mvp[0])?.nickname || mvp[0]
      : 'el chat';
    overlaySub.textContent = `${state.heroes.size} héroes · MVP: ${mvpName}`;
    tts.speakRaw(`¡Victoria! El dragón cayó. MVP de la batalla: ${mvpName}.`);
    pushFeed('🎉 <strong>¡EL DRAGÓN HA CAÍDO!</strong>');
  } else {
    overlay?.classList.add('defeat');
    overlayEmoji.textContent = '💀';
    overlayTitle.textContent = '¡EL DRAGÓN GANÓ!';
    overlaySub.textContent = 'La furia explotó… ¡inténtenlo en la próxima ronda!';
    tts.speakRaw('¡El dragón desató su furia! El chat fue derrotado. Nueva batalla pronto.');
    pushFeed('💀 <strong>¡Furia máxima! El dragón ganó</strong>');
  }

  setTimeout(resetRound, END_MS);
}

function resetRound() {
  state.rage = 0;
  state.frozen = false;
  state.round += 1;
  state.damage.clear();
  state.comboBucket = [];
  state.comboUntil = 0;

  if (roundEl) roundEl.textContent = String(state.round);
  overlay?.classList.add('hidden');

  for (const h of state.heroes.values()) h.el?.remove();
  state.heroes.clear();
  recalcDifficulty(false);

  renderHud();
  updateTop();
}

function applyHit(amount, source, user, extra = {}) {
  if (state.frozen || amount <= 0) return;

  const mult = source === 'like' ? getComboMult() : 1;
  const dmg = amount * mult * state.damageMult;
  state.hp = Math.max(0, state.hp - dmg);
  state.rage = Math.max(0, state.rage - (source === 'like' ? RAGE_LIKE_RELIEF : RAGE_GIFT_RELIEF));

  addDamage(user, dmg);

  const hero = state.heroes.get(user);
  if (hero?.el) {
    const x = parseFloat(hero.el.style.left) || heroesLayer.clientWidth / 2;
    const y = parseFloat(hero.el.style.top) || heroesLayer.clientHeight / 2;
    spawnSlash(x, y);
  }

  dragon?.classList.remove('hurt');
  void dragon?.offsetWidth;
  dragon?.classList.add('hurt');
  spawnDmgPop(dmg, extra.crit);

  if (source === 'like') trackCombo(extra.likeCount || 1);
  if (extra.crit) {
    showCrit();
    const nick = state.heroes.get(user)?.nickname || user || 'alguien';
    pushFeed(`🎁 <strong>${escapeHtml(nick)}</strong> — golpe crítico`);
    tts.speakRaw(`¡Golpe crítico de ${nick}! El dragón tiembla.`);
  }

  renderHud();
  updateTop();

  if (state.hp <= 0) endBattle(true);
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!state.frozen) {
    state.rage = Math.min(100, state.rage + state.ragePerSec * dt);
    renderHud();
    if (state.rage >= 100) endBattle(false);
  }

  layoutHeroes();
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
      case 'dragon_join':
        joinHero(msg.user, msg.nickname, msg.avatar);
        break;
      case 'dragon_hit':
        applyHit(msg.amount, msg.source, msg.user, msg);
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
  if (e.key === 'a' || e.key === 'A') joinHero(u, u, null);
  else if (e.key === 'l' || e.key === 'L') applyHit(9, 'like', u, { likeCount: 1 });
  else if (e.key === 'g' || e.key === 'G') applyHit(80, 'gift', u, { crit: true, giftName: 'Rosa' });
}

function scaleStage() {
  if (!stage) return;
  scaleFactor = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.setProperty('--scale', String(scaleFactor));
  stage.style.transform = `scale(${scaleFactor})`;
  requestAnimationFrame(layoutHeroes);
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
recalcDifficulty(false);
renderHud();
scaleStage();
window.addEventListener('resize', scaleStage);
window.addEventListener('keydown', demoKeys);
connectWs();
requestAnimationFrame(tick);
