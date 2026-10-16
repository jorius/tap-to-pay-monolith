import type { HttpErrorCode } from '../contracts.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: HttpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const validation = (message: string) => new HttpError(400, 'VALIDATION', message);
