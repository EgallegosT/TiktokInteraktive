/** Lógica Bola de Cristal — preguntas en chat y menciones a tap/regalos */

const CRYSTAL_ASK_COOLDOWN_MS = Number(process.env.CRYSTAL_ASK_COOLDOWN_MS) || 22000;
const CRYSTAL_MENTION_COOLDOWN_MS = Number(process.env.CRYSTAL_MENTION_COOLDOWN_MS) || 40000;
const CRYSTAL_NUDGE_LIKES = Number(process.env.CRYSTAL_NUDGE_LIKES) || 32;

/** @type {Map<string, number>} */
const lastAskAt = new Map();
/** @type {Map<string, number>} */
const lastMentionAt = new Map();
/** @type {Map<string, { nickname: string, avatar: string | null, t: number }>} */
const recentLikers = new Map();

let likeBurst = 0;

/**
 * @param {(payload: object) => void} broadcast
 * @param {{ skipCommands: (comment: string) => boolean }} hooks
 */
export function createCrystalHandlers(broadcast, hooks) {
  function parseQuestion(comment) {
    const raw = (comment || '').trim();
    if (raw.length < 6) return null;
    if (hooks.skipCommands(raw)) return null;

    let q = raw;
    const bola = raw.match(/^bola[:\s,]+(.+)/i);
    if (bola) q = bola[1].trim();

    const isQuestion =
      /\?/.test(q) ||
      /^(qué|que|cómo|como|cuándo|cuando|dónde|donde|por qué|porque|quién|quien|cuál|cual|será|sera|debo|puedo|hay|tendré|tendra|pregunta|bolita|cristal)\b/i.test(
        q
      );

    if (!isQuestion) return null;
    return q.slice(0, 220);
  }

  function ask(data, question) {
    const user = data.uniqueId;
    if (!user || !question) return;

    const now = Date.now();
    const last = lastAskAt.get(user) || 0;
    if (now - last < CRYSTAL_ASK_COOLDOWN_MS) return;

    lastAskAt.set(user, now);
    broadcast({
      type: 'crystal_ask',
      user,
      nickname: data.nickname || user,
      avatar: data.profilePictureUrl || null,
      question,
    });
    console.log(`  [bola] @${user}: ${question.slice(0, 60)}`);
  }

  function mention(user, nickname, avatar, source, extra = {}) {
    if (!user) return;
    const now = Date.now();
    const last = lastMentionAt.get(user) || 0;
    if (source !== 'gift' && now - last < CRYSTAL_MENTION_COOLDOWN_MS) return;

    lastMentionAt.set(user, now);
    broadcast({
      type: 'crystal_mention',
      user,
      nickname: nickname || user,
      avatar: avatar || null,
      source,
      ...extra,
    });
    console.log(`  [bola] mención ${source} → @${nickname || user}`);
  }

  function onLike(data) {
    const user = data.uniqueId;
    if (!user) return;

    recentLikers.set(user, {
      nickname: data.nickname || user,
      avatar: data.profilePictureUrl || null,
      t: Date.now(),
    });

    likeBurst += data.likeCount || 1;
    if (likeBurst < CRYSTAL_NUDGE_LIKES) return;
    likeBurst = 0;

    const now = Date.now();
    const pool = [...recentLikers.entries()].filter(
      ([u, v]) => now - v.t < 120000 && now - (lastMentionAt.get(u) || 0) > CRYSTAL_MENTION_COOLDOWN_MS
    );
    if (!pool.length) return;

    const [u, info] = pool[Math.floor(Math.random() * pool.length)];
    mention(u, info.nickname, info.avatar, 'like');
  }

  function onGift(data) {
    mention(
      data.uniqueId,
      data.nickname || data.uniqueId,
      data.profilePictureUrl || null,
      'gift',
      { giftName: data.giftName || data.gift?.name || 'regalo' }
    );
  }

  return { parseQuestion, ask, onLike, onGift };
}
