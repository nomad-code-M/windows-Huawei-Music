import type { AppError, Result } from './types';

export function ok<T>(data: T): Result<T>;
export function fail<T = never>(error: AppError): Result<T>;
export function errorFrom(error: unknown, fallback?: string): AppError;
