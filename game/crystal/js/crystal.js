import { createTts } from '../../race/js/tts.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;

const VISION_MS = 4200;
const REVEAL_MS = 6500;
const MENTION_BANNER_MS = 5500;

const STAGE_W = 1080;
const STAGE_H = 1350;

const params = new URLSearchParams(location.search);
const useSquareLayout = params.get('layout') === 'square';

const ANSWERS = [
  'Sí… pero solo si confías en ti.',
  'El universo dice que sí, con estilo.',
  'Hmm… mejor espera un poco más.',
  '¡Absolutamente! El live lo confirma.',
  'No está en las estrellas… por ahora.',
  'La bola ve un plot twist positivo.',
  'Sí, y te van a sorprender.',
  'Pregunta de nuevo después del próximo regalo.',
  'Las vibras dicen: ¡dale con todo!',
  'Tal vez… el destino está escribiendo.',
  'Sí, pero no se lo digas a nadie.',
  'La respuesta está en tu siguiente tap tap.',
  'El cristal susurra: confía en el proceso.',
  '¡Sí! Y celebra cuando pase.',
  'No… pero algo mejor viene en camino.',
  'Las señales apuntan a un gran sí.',
  'Hoy es día de milagros. Sí.',
  'La bola se ríe… y dice que sí.',
  'Necesitas más emoción en el chat primero.',
  'Sí, el live te respalda.',
  'El futuro brilla… literalmente.',
  'Puede ser… mantén la fe.',
  '¡Obvio que sí! No lo dudes.',
  'La visión es confusa… intenta otra pregunta.',
  'Sí, en secreto ya lo sabías.',
  'El cosmos vota sí por unanimidad.',
  'No por ahora… pero casi.',
  'Sí, y te va a salir mejor de lo que imaginas.',
  'La bola ve confeti en tu camino.',
  'Depende… ¿ya diste tap tap hoy?',
  'Sí. Punto. Siguiente pregunta.',
  'El misterio dice: sorpréndete tú mismo.',
  'Las estrellas parpadearon… es un sí.',
  'Mejor no forzar el destino hoy.',
  'Sí, con un toque de locura.',
  'La energía del live dice ¡adelante!',
  'No… pero aprenderás algo valioso.',
  'Sí, y el chat lo va a amar.',
  'La bola predice risas y buenas noticias.',
];

const PHRASES = [
  'LA NIEBLA SE ABRE…',
  'VISIONANDO…',
  'EL CRISTAL VIBRA…',
  'CONSULTANDO LAS ESTRELLAS…',
  'ESCUCHANDO AL LIVE…',
];

const state = {
  queue: [],
  processing: false,
  visionCount: 0,
  isDemo: false,
};

let tts = createTts({ enabled: true });
let welcomePlayed = false;
let mentionTimer = null;

const $ = (id) => document.getElementById(id);
const ball = $('ball');
const ballMist = $('ball-mist');
const ballPhase = $('ball-phase');
const reading = $('reading');
const readingFrom = $('reading-from');
const readingQ = $('reading-q');
const readingA = $('reading-a');
const mentionLine = $('mention-line');
const visionLine = $('vision-line');
const queueLine = $('queue-line');
const mentionBanner = $('mention-banner');
const feed = $('feed');
const statusEl = $('status');
const demoHint = $('demo-hint');
const ttsToggle = $('tts-toggle');
const stage = $('app');

function applyLayout() {
  if (!stage) return;
  const h = useSquareLayout ? 1080 : STAGE_H;
  if (useSquareLayout) {
    stage.classList.add('layout-square');
    document.body.classList.remove('layout-top');
    document.body.classList.add('layout-center');
    stage.style.transformOrigin = 'center center';
  } else {
    stage.classList.remove('layout-square');
    document.body.classList.add('layout-top');
    document.body.classList.remove('layout-center');
    stage.style.transformOrigin = 'top center';
  }
  stage.dataset.stageH = String(h);
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

function pickAnswer() {
  return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
}

function updateQueueHud() {
  if (!queueLine) return;
  if (state.processing) {
    queueLine.textContent = '🔮 Visionando…';
    queueLine.classList.remove('hidden');
    ball?.classList.add('queue-hint');
  } else if (state.queue.length > 0) {
    queueLine.textContent =
      state.queue.length === 1 ? '1 pregunta en cola' : `${state.queue.length} preguntas en cola`;
    queueLine.classList.remove('hidden');
    ball?.classList.add('queue-hint');
  } else {
    queueLine.classList.add('hidden');
    ball?.classList.remove('queue-hint');
  }
}

function pushFeed(html) {
  if (!feed) return;
  const li = document.createElement('li');
  li.innerHTML = html;
  feed.prepend(li);
  while (feed.children.length > 5) feed.lastChild?.remove();
}

function setMentionLine(msg) {
  if (!mentionLine) return;
  const isGift = msg.source === 'gift';
  const icon = isGift ? '🎁' : '👆';
  mentionLine.className = `info-line mention-line active ${isGift ? 'gift' : ''}`;
  const textEl = mentionLine.querySelector('.info-text');
  if (textEl) {
    textEl.innerHTML = `${icon} <strong>${escapeHtml(msg.nickname)}</strong><br/>¡Escribe tu pregunta en el chat!`;
  }
}

function setVisionLine(nickname, question, answer) {
  if (!visionLine) return;
  const q = question.length > 45 ? `${question.slice(0, 45)}…` : question;
  visionLine.className = 'info-line vision-line active';
  const textEl = visionLine.querySelector('.info-text');
  if (textEl) {
    textEl.innerHTML = `<strong>${escapeHtml(nickname)}</strong><span class="vision-q">«${escapeHtml(q)}»</span><span class="vision-a">${escapeHtml(answer)}</span>`;
  }
}

function addMention(msg) {
  setMentionLine(msg);

  const isGift = msg.source === 'gift';
  const bannerText = isGift
    ? `✨ ¡${msg.nickname}! La bola te espera — haz tu pregunta`
    : `🔮 ¡${msg.nickname}! Pregúntale algo a la bola`;

  if (mentionBanner) {
    mentionBanner.textContent = bannerText;
    mentionBanner.className = `mention-banner ${isGift ? 'gift' : ''}`;
    mentionBanner.classList.remove('hidden');
    clearTimeout(mentionTimer);
    mentionTimer = setTimeout(() => mentionBanner.classList.add('hidden'), MENTION_BANNER_MS);
  }

  tts.speakRaw(
    isGift
      ? `¡Gracias ${msg.nickname} por el regalo! Pregúntale ahora a la bola de cristal.`
      : `¡${msg.nickname}! La bola quiere tu pregunta. Escríbela en el chat.`
  );

  pushFeed(
    isGift
      ? `🎁 <strong>${escapeHtml(msg.nickname)}</strong> — ¡pregunta!`
      : `👆 <strong>${escapeHtml(msg.nickname)}</strong> — ¿tu pregunta?`
  );
}

function addHistory(nickname, question, answer) {
  setVisionLine(nickname, question, answer);
}

function playWelcome() {
  if (welcomePlayed) return;
  welcomePlayed = true;
  tts.speakRaw(
    '¡Bienvenidos a la Bola de Cristal! Escriban su pregunta en el chat. Si dan tap tap o regalos, los mencionamos para que pregunten.'
  );
}

async function processVision(item) {
  state.processing = true;
  updateQueueHud();
  reading?.classList.add('hidden');
  ball?.classList.add('vision');
  ball?.classList.remove('reveal');
  ballMist?.classList.add('active');

  const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  if (ballPhase) ballPhase.textContent = phrase;

  await sleep(VISION_MS);

  const answer = pickAnswer();
  state.visionCount += 1;

  ball?.classList.remove('vision');
  ball?.classList.add('reveal');
  ballMist?.classList.remove('active');
  if (ballPhase) ballPhase.textContent = '✨ VISIÓN';

  if (readingFrom) readingFrom.textContent = item.nickname;
  if (readingQ) readingQ.textContent = `«${item.question}»`;
  if (readingA) readingA.textContent = answer;
  reading?.classList.remove('hidden');

  addHistory(item.nickname, item.question, answer);
  pushFeed(`🔮 <strong>${escapeHtml(item.nickname)}</strong> → ${escapeHtml(answer)}`);

  tts.speakRaw(`${item.nickname} preguntó. La bola responde: ${answer}`);

  await sleep(REVEAL_MS);

  ball?.classList.remove('reveal');
  if (ballPhase) ballPhase.textContent = 'ESPERANDO…';
  reading?.classList.add('hidden');

  state.processing = false;
  updateQueueHud();
  drainQueue();
}

function enqueueQuestion(msg) {
  state.queue.push({
    user: msg.user,
    nickname: msg.nickname || msg.user,
    avatar: msg.avatar,
    question: msg.question,
  });
  updateQueueHud();
  if (!state.processing) drainQueue();
}

async function drainQueue() {
  if (state.processing || state.queue.length === 0) return;
  const item = state.queue.shift();
  updateQueueHud();
  await processVision(item);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
      case 'crystal_ask':
        enqueueQuestion(msg);
        break;
      case 'crystal_mention':
        addMention(msg);
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
  const u = `fan_${Date.now() % 9999}`;
  if (e.key === 'p' || e.key === 'P') {
    enqueueQuestion({
      user: u,
      nickname: 'Místico_demo',
      avatar: null,
      question: '¿Voy a tener suerte en el live de hoy?',
    });
  } else if (e.key === 'm' || e.key === 'M') {
    addMention({ user: u, nickname: 'Tapper_demo', avatar: null, source: 'like' });
  } else if (e.key === 'g' || e.key === 'G') {
    addMention({
      user: u,
      nickname: 'Generoso_demo',
      avatar: null,
      source: 'gift',
      giftName: 'Rosa',
    });
  }
}

function scaleStage() {
  if (!stage) return;
  const h = useSquareLayout ? 1080 : STAGE_H;
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / h);
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

applyLayout();
initTts();
updateQueueHud();
scaleStage();
window.addEventListener('resize', scaleStage);
window.addEventListener('keydown', demoKeys);
connectWs();
