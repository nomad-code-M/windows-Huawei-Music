import type { Track } from '../shared/types';

export type HeartbeatFeedbackKind = 'like' | 'skip' | 'complete';
export type HeartbeatFeedback = { trackId: string; kind: HeartbeatFeedbackKind; at: number };
export type HeartbeatPreference = { artists: Map<string, number>; albums: Map<string, number> };
export type HeartbeatFeatures = {
  id: string;
  artists: string[];
  album: string;
  tokens: string[];
  duration: number | null;
  lossless: boolean;
};

export const HEARTBEAT_DEFAULTS: {
  enabled: boolean;
  exploration: number;
  horizon: number;
  batch: number;
  recentLimit: number;
  poolLimit: number;
  feedbackLimit: number;
  poolPages: number;
  poolPageSize: number;
};

export function features(track: Track): HeartbeatFeatures;
export function buildPreference(feedback: HeartbeatFeedback[], pool: Track[]): HeartbeatPreference;
export function recordFeedback(feedback: HeartbeatFeedback[], trackId: string, kind: HeartbeatFeedbackKind, now?: number): HeartbeatFeedback[];
export function mergePool(pool: Track[], tracks: Track[], limit?: number): Track[];
export function pushRecent(recentIds: string[], id: string, limit?: number): string[];
export function similarity(seed: Track, candidate: Track, preference?: HeartbeatPreference | null): number;

export type RecommendBatchInput = {
  seed: Track;
  pool: Track[];
  feedback?: HeartbeatFeedback[];
  recentIds?: string[];
  queuedIds?: string[];
  count?: number;
  exploration?: number;
  random?: () => number;
};
export function recommendBatch(input: RecommendBatchInput): Track[];

export type ExtendQueueInput = {
  queue?: Track[];
  order?: number[];
  cursor?: number;
  seed?: Track;
  pool?: Track[];
  feedback?: HeartbeatFeedback[];
  recentIds?: string[];
  horizon?: number;
  batch?: number;
  exploration?: number;
  random?: () => number;
};
export type ExtendQueueResult = { queue: Track[]; order: number[]; added: string[] };
export function extendQueue(input: ExtendQueueInput): ExtendQueueResult;
