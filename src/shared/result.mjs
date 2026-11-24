// 与项目其他 shared 模块一致，使用 .mjs + .d.mts，让 node --test 能直接加载。
export function ok(data) {
  return { ok: true, data };
}

export function fail(error) {
  return { ok: false, error };
}

export function errorFrom(error, fallback = '操作未完成') {
  const message = error instanceof Error ? error.message : fallback;
  if (error instanceof Error && error.name === 'WriteOutcomeError') {
    const write = /** @type {Error & { kind?: string }} */ (error);
    return { kind: write.kind === 'permission' ? 'permission' : 'unknown', message, retryable: false };
  }
  const lower = message.toLowerCase();
  if (lower.includes('网络') || lower.includes('network') || lower.includes('fetch')) {
    return { kind: 'network', message: '网络请求失败，请检查连接后重试。', retryable: true };
  }
  if (message.includes('需要音乐会话') || message.includes('请先登录华为音乐') || message.includes('音乐会话缺少')) {
    return { kind: 'auth', message, retryable: false };
  }
  return { kind: 'unknown', message, retryable: true };
}
