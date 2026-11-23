import { invoke, type InvokeArgs, type InvokeOptions } from '@tauri-apps/api/core';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function parseAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    if (typeof error.code === 'string' && typeof error.message === 'string') {
      return new AppError(error.code, error.message);
    }
  }
  return new AppError('ipc_error', error instanceof Error ? error.message : String(error));
}

export async function invokeCommand<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  try {
    return await invoke<T>(command, args, options);
  } catch (error) {
    throw parseAppError(error);
  }
}

export function unavailable(feature: string): AppError {
  return new AppError('not_implemented', `${feature} is not available yet.`);
}
