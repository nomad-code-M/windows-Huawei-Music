/**
 * 心动模式 —— 纯本地相似度推荐。
 *
 * 设计约束（为什么这样写）：
 * 1. 不调用华为的推荐接口（官方 querydaily 在多个变体上均返回 400），也不引入任何新的
 *    私有接口；只用客户端已经在内存里、或用户正常浏览收藏时本来就会读取的曲目元数据。
 * 2. 不发起批量抓取。开启时最多读取若干页收藏，走既有缓存，失败静默、不重试。
 * 3. 不写云端、不上传任何听歌反馈。反馈只存在渲染进程内存里，退出即消失。
 * 4. 全部是纯函数，可在 Node 下直接单测，与 Electron / 网络 / 账号完全解耦。
 */

export const HEARTBEAT_DEFAULTS = Object.freeze({
  enabled: false,
  /** 随机探索比例，避免永远只推同一批歌。 */
  exploration: 0.12,
  /** 队列剩余不足几首时补充下一批。 */
  horizon: 3,
  /** 每次补充几首。 */
  batch: 3,
  /** 最近播放去重窗口。 */
  recentLimit: 40,
  /** 本地曲目池上限，防止无界增长。 */
  poolLimit: 600,
  /** 反馈事件上限。 */
  feedbackLimit: 400,
  /** 开启时最多读取的收藏页数（每页 50，复用既有分页缓存）。 */
  poolPages: 4,
  poolPageSize: 50,
});

const WEIGHTS = Object.freeze({
  artist: 0.40,
  album: 0.16,
  title: 0.10,
  duration: 0.08,
  lossless: 0.04,
  preference: 0.20,
  diversity: 0.22,
});

const FEEDBACK_DELTA = Object.freeze({ like: 1, complete: 0.35, skip: -0.7 });

function norm(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** 同时保留 id 与名称两种键：有的接口只给 id，有的只给名字，二者都要能匹配上。 */
function artistKeys(track) {
  const keys = [];
  for (const artist of (Array.isArray(track?.artists) ? track.artists : [])) {
    const id = norm(artist?.id);
    const name = norm(artist?.name);
    if (id) keys.push(`id:${id}`);
    if (name) keys.push(`name:${name}`);
  }
  return [...new Set(keys)];
}

/** 中文按二元字组、英文按词，用来识别「同一首歌的不同版本 / Live / 伴奏」。 */
function titleTokens(track) {
  const title = norm(track?.title)
    .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, ' ')
    .replace(/\b(live|remix|instrumental|伴奏|现场版|翻唱版)\b/g, ' ');
  const words = (title.match(/[a-z0-9]+/g) ?? []).filter(word => word.length > 1);
  const han = (title.match(/[\u4e00-\u9fa5]/g) ?? []).join('');
  const grams = [];
  for (let index = 0; index < han.length - 1; index += 1) grams.push(han.slice(index, index + 2));
  return [...new Set([...words, ...grams])];
}

export function features(track) {
  const duration = typeof track?.durationSeconds === 'number' && Number.isFinite(track.durationSeconds) && track.durationSeconds > 0
    ? track.durationSeconds : null;
  return {
    id: typeof track?.id === 'string' ? track.id : '',
    artists: artistKeys(track),
    album: norm(track?.album?.id) || norm(track?.album?.title),
    tokens: titleTokens(track),
    duration,
    lossless: (Array.isArray(track?.qualities) ? track.qualities : [])
      .some(item => item?.quality === 'lossless' || item?.quality === 'ultra'),
  };
}

/** 余弦式重叠；空特征返回 0，不猜。 */
function overlap(left, right) {
  if (!left.length || !right.length) return 0;
  const set = new Set(right);
  let hits = 0;
  for (const item of left) if (set.has(item)) hits += 1;
  return hits / Math.sqrt(left.length * right.length);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** 把反馈事件聚合成「艺人 / 专辑」偏好权重，全部在内存里算。 */
export function buildPreference(feedback, pool) {
  const byId = new Map((Array.isArray(pool) ? pool : []).filter(Boolean).map(track => [track.id, track]));
  const artists = new Map();
  const albums = new Map();
  for (const event of (Array.isArray(feedback) ? feedback : [])) {
    const delta = FEEDBACK_DELTA[event?.kind] ?? 0;
    if (!delta) continue;
    const track = byId.get(event?.trackId);
    if (!track) continue;
    const info = features(track);
    for (const key of info.artists) artists.set(key, clamp((artists.get(key) ?? 0) + delta, -3, 3));
    if (info.album) albums.set(info.album, clamp((albums.get(info.album) ?? 0) + delta, -3, 3));
  }
  return { artists, albums };
}

export function recordFeedback(feedback, trackId, kind, now = Date.now()) {
  if (!trackId || !(kind in FEEDBACK_DELTA)) return feedback;
  const next = [...(Array.isArray(feedback) ? feedback : []), { trackId, kind, at: now }];
  return next.length > HEARTBEAT_DEFAULTS.feedbackLimit
    ? next.slice(next.length - HEARTBEAT_DEFAULTS.feedbackLimit) : next;
}

export function mergePool(pool, tracks, limit = HEARTBEAT_DEFAULTS.poolLimit) {
  const seen = new Set();
  const merged = [];
  for (const track of [...(Array.isArray(pool) ? pool : []), ...(Array.isArray(tracks) ? tracks : [])]) {
    if (!track || typeof track.id !== 'string' || typeof track.title !== 'string') continue;
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    merged.push(track);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function pushRecent(recentIds, id, limit = HEARTBEAT_DEFAULTS.recentLimit) {
  if (!id) return recentIds;
  const next = [...(Array.isArray(recentIds) ? recentIds : []).filter(item => item !== id), id];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function similarity(seed, candidate, preference = null) {
  if (!seed || !candidate || seed.id === candidate.id) return 0;
  const a = features(seed);
  const b = features(candidate);
  let score = WEIGHTS.artist * overlap(a.artists, b.artists);
  if (a.album && a.album === b.album) score += WEIGHTS.album;
  score += WEIGHTS.title * overlap(a.tokens, b.tokens);
  if (a.duration !== null && b.duration !== null) {
    score += WEIGHTS.duration * Math.max(0, 1 - Math.abs(a.duration - b.duration) / 180);
  }
  if (b.lossless) score += WEIGHTS.lossless;
  if (preference) {
    const artistValues = b.artists.map(key => preference.artists.get(key) ?? 0);
    if (artistValues.length) {
      const mean = artistValues.reduce((sum, value) => sum + value, 0) / artistValues.length;
      score += WEIGHTS.preference * clamp(mean, -1, 1);
    }
    if (b.album) score += 0.06 * clamp(preference.albums.get(b.album) ?? 0, -1, 1);
  }
  return clamp(score, 0, 1.5);
}

/**
 * 挑一批相似曲目。贪心阶段对「已选中的同艺人」做惩罚，避免连推三首同一个歌手。
 * random 可注入以便测试确定性。
 */
export function recommendBatch({
  seed, pool, feedback = [], recentIds = [], queuedIds = [],
  count = HEARTBEAT_DEFAULTS.batch, exploration = HEARTBEAT_DEFAULTS.exploration, random = Math.random,
}) {
  if (!seed || !Array.isArray(pool) || !pool.length || count <= 0) return [];
  const preference = buildPreference(feedback, pool);
  const excluded = new Set([seed.id, ...(recentIds ?? []), ...(queuedIds ?? [])]);
  const rand = typeof random === 'function' ? random : Math.random;
  const scored = pool
    .filter(track => track && track.id && track.available !== false && !excluded.has(track.id))
    .map(track => ({
      track,
      score: similarity(seed, track, preference) + clamp(exploration, 0, 1) * rand(),
      artists: features(track).artists,
    }));
  if (!scored.length) return [];
  scored.sort((left, right) => right.score - left.score || (left.track.id < right.track.id ? -1 : 1));

  const remaining = [...scored];
  const picked = [];
  const artistCount = new Map();
  while (picked.length < count && remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const repeated = remaining[index].artists.reduce((sum, key) => sum + (artistCount.get(key) ?? 0), 0);
      const value = remaining[index].score - repeated * WEIGHTS.diversity;
      if (value > bestValue) { bestValue = value; bestIndex = index; }
    }
    const chosen = remaining.splice(bestIndex, 1)[0];
    picked.push(chosen.track);
    for (const key of chosen.artists) artistCount.set(key, (artistCount.get(key) ?? 0) + 1);
  }
  return picked;
}

/**
 * 播放快到队尾时续上一批。返回新的 queue / order 与新增 id；调用方负责写回 refs 与状态。
 * order 是索引数组（可能是 shuffle 后的排列），新行永远追加到末尾，保持其排列性质。
 */
export function extendQueue({
  queue = [], order = [], cursor = -1, seed, pool = [], feedback = [], recentIds = [],
  horizon = HEARTBEAT_DEFAULTS.horizon, batch = HEARTBEAT_DEFAULTS.batch,
  exploration = HEARTBEAT_DEFAULTS.exploration, random = Math.random,
}) {
  const unchanged = { queue, order, added: [] };
  if (!pool.length || batch <= 0) return unchanged;
  if (order.length - cursor - 1 >= horizon) return unchanged;
  const active = seed ?? (cursor >= 0 ? queue[order[cursor]] : undefined);
  if (!active) return unchanged;
  const queuedIds = order.map(index => queue[index]?.id).filter(Boolean);
  const picks = recommendBatch({
    seed: active, pool, feedback, recentIds, queuedIds,
    count: batch, exploration, random,
  });
  if (!picks.length) return unchanged;
  const nextQueue = [...queue];
  const nextOrder = [...order];
  for (const track of picks) {
    nextOrder.push(nextQueue.length);
    nextQueue.push(track);
  }
  return { queue: nextQueue, order: nextOrder, added: picks.map(track => track.id) };
}
