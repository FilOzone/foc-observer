import { InputError } from "./inputs.js"

/** A locally authored diagnostic suitable for clients. Never wrap upstream text. */
export class PublicError extends Error {}

export class ServiceUnavailableError extends PublicError {}

export function publicErrorMessage(error: unknown): string {
  return error instanceof InputError || error instanceof PublicError
    ? error.message.slice(0, 300)
    : "Backend request failed."
}
