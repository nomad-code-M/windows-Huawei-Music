import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEARTBEAT_DEFAULTS, buildPreference, extendQueue, features, mergePool,
  pushRecent, recommendBatch, recordFeedback, similarity,
} from '../src/renderer/heartbeat.mjs';

function track(id, title, artists, extra = {}) {
  return {
    id,
    title,
    artists: artists.map(name => ({ name })),
    available: true,
    ...extra,
  };
}

const seed = track('seed', '晴天', ['周杰伦'], {
  album: { id: 'album-1', title: '叶惠美' }, durationSeconds: 269,
});
const sameArtist = track('b', '七里香', ['周杰伦'], {
  album: { id: 'album-2', title: '七里香' }, durationSeconds: 260,
});
const sameAlbum = track('c', '你听得到', ['周杰伦'], {
  album: { id: 'album-1', title: '叶惠美' }, durationSeconds: 250,
});
const unrelated = track('d', 'An English Title', ['Someone Else'], {
  album: { id: 'album-9', title: 'Other' }, durationSeconds: 42,
});
const pool = [seed, sameArtist, sameAlbum, unrelated];

test('冷启动：空池或空种子不推荐', () => {
  assert.deepEqual(recommendBatch({ seed, pool: [], random: () => 0.5 }), []);
  assert.deepEqual(recommendBatch({ seed: null, pool, random: () => 0.5 }), []);
  assert.deepEqual(recommendBatch({ seed, pool, count: 0, random: () => 0.5 }), []);
});

test('同艺人 / 同专辑优先于无关曲目', () => {
  assert.ok(similarity(seed, sameArtist) > similarity(seed, unrelated));
  assert.ok(similarity(seed, sameAlbum) > similarity(seed, sameArtist));
  const picks = recommendBatch({ seed, pool, count: 2, exploration: 0, random: () => 0.5 });
  assert.deepEqual(picks.map(item => item.id), ['c', 'b']);
});

test('特征提取同时保留艺人 id 与名称，且能识别 Live 版本', () => {
  const withId = track('x', 'Song', [], {});
  withId.artists = [{ id: 'artist-7', name: '周杰伦' }];
  const keys = features(withId).artists;
  assert.ok(keys.includes('id:artist-7'));
  assert.ok(keys.includes('name:周杰伦'));
  const live = track('live', '晴天 (Live)', ['周杰伦']);
  assert.ok(similarity(seed, live) > similarity(seed, unrelated));
});

test('反馈聚合：like 提升、skip 压低艺人权重', () => {
  const liked = buildPreference([{ trackId: 'b', kind: 'like', at: 1 }], pool);
  const skipped = buildPreference([{ trackId: 'b', kind: 'skip', at: 1 }], pool);
  assert.ok(liked.artists.get('name:周杰伦') > 0);
  assert.ok(skipped.artists.get('name:周杰伦') < 0);
  assert.ok(similarity(seed, sameArtist, liked) > similarity(seed, sameArtist, skipped));
});

test('偏好被限制在合理范围，不会因反复反馈无限放大', () => {
  const events = Array.from({ length: 50 }, (_, index) => ({ trackId: 'b', kind: 'like', at: index }));
  const preference = buildPreference(events, pool);
  assert.equal(preference.artists.get('name:周杰伦'), 3);
});

test('跳过反馈确实改变推荐排序', () => {
  const otherArtistSameAlbum = track('e', '同一专辑另一首', ['另一位'], {
    album: { id: 'album-1', title: '叶惠美' }, durationSeconds: 268,
  });
  const candidates = [seed, sameArtist, otherArtistSameAlbum];
  const baseline = recommendBatch({ seed, pool: candidates, count: 1, exploration: 0, random: () => 0.5 });
  const skipped = recommendBatch({
    seed, pool: candidates, count: 1, exploration: 0, random: () => 0.5,
    feedback: [{ trackId: 'b', kind: 'skip', at: 1 }, { trackId: 'b', kind: 'skip', at: 2 }],
  });
  assert.equal(baseline[0].id, 'b');
  assert.equal(skipped[0].id, 'e');
});

test('去重：种子、最近播放、已在队列的曲目都不会再被推荐', () => {
  const picks = recommendBatch({
    seed, pool, count: 3, exploration: 0, random: () => 0.5,
    recentIds: ['c'], queuedIds: ['b'],
  });
  assert.deepEqual(picks.map(item => item.id), ['d']);
  assert.ok(!picks.some(item => item.id === 'seed'));
});

test('无版权曲目不会被推荐', () => {
  const unavailable = { ...sameArtist, id: 'blocked', available: false };
  const picks = recommendBatch({ seed, pool: [seed, unavailable], count: 1, exploration: 0, random: () => 0.5 });
  assert.deepEqual(picks, []);
});

test('多样性：同艺人不会被连着推满', () => {
  const many = Array.from({ length: 8 }, (_, index) => track(`jay-${index}`, `歌${index}`, ['周杰伦']));
  const other = track('other', '别的风格', ['别人']);
  const picks = recommendBatch({
    seed, pool: [seed, ...many, other], count: 3, exploration: 0, random: () => 0.5,
  });
  assert.equal(picks.length, 3);
  assert.ok(picks.some(item => item.id === 'other'));
});

test('extendQueue：队列充足时原样返回，不改动引用', () => {
  const queue = [seed, sameArtist, sameAlbum, unrelated];
  const order = [0, 1, 2, 3];
  const result = extendQueue({ queue, order, cursor: 0, pool, random: () => 0.5 });
  assert.equal(result.queue, queue);
  assert.equal(result.order, order);
  assert.deepEqual(result.added, []);
});

test('extendQueue：队尾不足时追加，且 order 保持排列性质', () => {
  const queue = [seed, sameArtist];
  const order = [0, 1];
  const result = extendQueue({
    queue, order, cursor: 1, pool, batch: 2, horizon: 3,
    exploration: 0, random: () => 0.5,
  });
  assert.equal(result.added.length, 2);
  assert.equal(result.queue.length, 4);
  assert.equal(result.order.length, 4);
  assert.deepEqual([...result.order].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.deepEqual(result.order.slice(0, 2), [0, 1]);
});

test('extendQueue：shuffle 顺序下追加仍不破坏排列', () => {
  const queue = [seed, sameArtist, sameAlbum, unrelated];
  const order = [2, 0, 3, 1];
  // 队列里已有的四首都不能重复推荐，所以池里额外放两首未入队曲目。
  const widerPool = [...pool, track('e', '新歌一', ['周杰伦']), track('f', '新歌二', ['周杰伦'])];
  const result = extendQueue({
    queue, order, cursor: 2, pool: widerPool, batch: 2, horizon: 3,
    exploration: 0, random: () => 0.5,
  });
  assert.equal(result.order.length, 6);
  assert.deepEqual([...result.order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(result.order.slice(0, 4), order);
});

test('曲目池去重且有上限', () => {
  const merged = mergePool([seed], [seed, sameArtist, unrelated], 2);
  assert.deepEqual(merged.map(item => item.id), ['seed', 'b']);
  assert.equal(mergePool([], [null, {}, { id: 'x' }], 10).length, 0);
});

test('最近播放与反馈列表都有上限', () => {
  // 逐个推入，验证窗口不会无限增长
  let ids = [];
  for (let index = 0; index < 100; index += 1) ids = pushRecent(ids, `id-${index}`, 5);
  assert.equal(ids.length, 5);
  assert.deepEqual(ids, ['id-95', 'id-96', 'id-97', 'id-98', 'id-99']);

  let feedback = [];
  for (let index = 0; index < HEARTBEAT_DEFAULTS.feedbackLimit + 30; index += 1) {
    feedback = recordFeedback(feedback, `id-${index}`, 'complete', index);
  }
  assert.equal(feedback.length, HEARTBEAT_DEFAULTS.feedbackLimit);
  assert.equal(recordFeedback([], 'x', 'unknown-kind').length, 0);
});

test('探索项可注入随机源，结果可复现', () => {
  const first = recommendBatch({ seed, pool, count: 2, exploration: 0.3, random: () => 0.5 });
  const second = recommendBatch({ seed, pool, count: 2, exploration: 0.3, random: () => 0.5 });
  assert.deepEqual(first.map(item => item.id), second.map(item => item.id));
});
