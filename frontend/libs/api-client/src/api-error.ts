import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetail } from '@shopivo/shared-models';

/** Normalised API error. `message` is always user-presentable Polish text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly problem: ProblemDetail | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new ApiError(0, 'NETWORK_ERROR', 'Brak połączenia z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.');
      }
      const body = error.error as ProblemDetail | null;
      if (body && typeof body === 'object' && 'status' in body) {
        const fields: Record<string, string> = {};
        for (const e of body.errors ?? []) {
          fields[e.field] ??= e.message;
        }
        return new ApiError(error.status, body.code ?? 'REQUEST_ERROR', body.detail ?? defaultMessage(error.status), fields, body);
      }
      return new ApiError(error.status, 'REQUEST_ERROR', defaultMessage(error.status));
    }
    return new ApiError(-1, 'UNKNOWN', 'Wystąpił nieoczekiwany błąd.');
  }
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Sesja wygasła. Zaloguj się ponownie.';
  if (status === 403) return 'Brak uprawnień do wykonania tej operacji.';
  if (status === 404) return 'Nie znaleziono zasobu.';
  if (status === 429) return 'Zbyt wiele prób. Spróbuj ponownie za chwilę.';
  if (status >= 500) return 'Wystąpił błąd serwera. Spróbuj ponownie później.';
  return 'Nie udało się wykonać operacji.';
}
