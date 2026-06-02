/**
 * Cola de voz para comentarios de seguidores (Web Speech API).
 */
export function createTts(options = {}) {
  let enabled = options.enabled !== false;
  const minChars = options.minChars ?? 8;
  const cooldownMs = options.cooldownMs ?? 4500;
  const lang = options.lang ?? 'es-MX';
  const maxQueue = 4;

  const queue = [];
  const recentKeys = new Set();
  let speaking = false;
  let lastStart = 0;
  let preferredVoice = null;

  function loadVoices() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    preferredVoice =
      voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang.startsWith('es')) ||
      voices[0] ||
      null;
  }

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function cleanForSpeech(text) {
    return text
      .replace(/https?:\/\S+/gi, '')
      .replace(/[@#][\w.]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
  }

  function speakNext() {
    if (!enabled || !window.speechSynthesis || speaking) return;
    if (queue.length === 0) return;

    const now = Date.now();
    const wait = cooldownMs - (now - lastStart);
    if (wait > 0) {
      setTimeout(speakNext, wait);
      return;
    }

    const { text } = queue.shift();
    speaking = true;
    lastStart = Date.now();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 1.08;
    utter.pitch = 1;
    if (preferredVoice) utter.voice = preferredVoice;

    utter.onend = () => {
      speaking = false;
      setTimeout(speakNext, 250);
    };
    utter.onerror = () => {
      speaking = false;
      speakNext();
    };

    window.speechSynthesis.speak(utter);
  }

  return {
    isSupported: () => typeof window !== 'undefined' && 'speechSynthesis' in window,

    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) {
        queue.length = 0;
        window.speechSynthesis?.cancel();
        speaking = false;
      }
    },

    enqueue(nickname, comment) {
      if (!enabled || !this.isSupported()) return false;

      const body = cleanForSpeech(comment);
      if (body.length < minChars) return false;

      const user = (nickname || 'seguidor').replace(/[^\w\sáéíóúñü.@_-]/gi, '').slice(0, 40);
      const key = `${user}:${body.toLowerCase()}`;
      if (recentKeys.has(key)) return false;
      recentKeys.add(key);
      setTimeout(() => recentKeys.delete(key), 25000);

      return this.speakRaw(`${user} dice: ${body}`);
    },

    /** Mensajes del sistema (bienvenida, logros) — sin mínimo de caracteres */
    speakRaw(text) {
      if (!enabled || !this.isSupported()) return false;
      const phrase = cleanForSpeech(text);
      if (!phrase) return false;

      queue.push({ text: phrase });
      while (queue.length > maxQueue) queue.shift();
      speakNext();
      return true;
    },

    cancel() {
      queue.length = 0;
      window.speechSynthesis?.cancel();
      speaking = false;
    },
  };
}
