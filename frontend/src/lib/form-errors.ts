import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiRequestError } from './api/http';

/** The human message for any thrown error, with a fallback for non-API failures. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/**
 * Puts a server rejection on the field that caused it when the API names one
 * (`error.details.field`, e.g. a duplicate subject code or a section that
 * isn't in the class), otherwise shows a toast. The server owns uniqueness and
 * cross-record rules, so this is the only place those errors can surface.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
  fallback: string,
): void {
  if (error instanceof ApiRequestError) {
    const field = (error.details as { field?: string } | undefined)?.field;
    if (field && fields.includes(field)) {
      setError(field as Path<T>, { message: error.message }, { shouldFocus: true });
      return;
    }
  }
  toast.error(errorMessage(error, fallback));
}
