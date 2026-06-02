/** Resuelve usuario Roblox y URL de thumbnail (avatar 2D). */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const thumbCache = new Map();

export function parseRobloxUsername(comment) {
  const raw = (comment || '').trim();
  if (!raw) return null;

  if (USERNAME_RE.test(raw)) return raw;

  const prefixed = raw.match(
    /(?:roblox|rbx|user(?:name)?|nick|soy|jugador|mi\s+user)[:\s]+([a-zA-Z0-9_]{3,20})/i
  );
  if (prefixed) return prefixed[1];

  if (raw.length <= 24) {
    const word = raw.split(/\s+/).find((w) => USERNAME_RE.test(w.replace(/[^a-zA-Z0-9_]/g, '')));
    if (word) return word.replace(/[^a-zA-Z0-9_]/g, '');
  }

  return null;
}

export async function resolveRobloxUser(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });

  if (!res.ok) throw new Error('Roblox API usuarios');
  const json = await res.json();
  const entry = json.data?.[0];
  if (!entry?.id) throw new Error('Usuario no encontrado');

  return { userId: entry.id, name: entry.name };
}

export async function fetchAvatarThumbnail(userId) {
  const cached = thumbCache.get(userId);
  if (cached && Date.now() - cached.t < 3600000) return cached.url;

  const url = new URL('https://thumbnails.roblox.com/v1/users/avatar');
  url.searchParams.set('userIds', String(userId));
  url.searchParams.set('size', '352x352');
  url.searchParams.set('format', 'Png');
  url.searchParams.set('isCircular', 'false');

  const res = await fetch(url);
  if (!res.ok) throw new Error('Roblox API avatar');
  const json = await res.json();
  const imageUrl = json.data?.[0]?.imageUrl;
  if (!imageUrl) throw new Error('Sin imagen de avatar');

  thumbCache.set(userId, { url: imageUrl, t: Date.now() });
  return imageUrl;
}
