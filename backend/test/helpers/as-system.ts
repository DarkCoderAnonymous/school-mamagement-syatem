import { TenantContext } from '../../src/tenant/context';

/**
 * Runs a direct model query outside any request, as trusted system code.
 *
 * The tenant plugin fails closed, so a bare `User.find()` in a test throws —
 * which is the point: it's the same protection that stops a background job
 * from reading every school. Tests that assert on raw collection state are
 * legitimately unscoped, and say so here.
 *
 * NOTE the `await`. A Mongoose query is lazy: `User.findOne().lean()` builds
 * a Query and only runs it when awaited. Handing that Query back out of
 * `runAsSystem` would execute it AFTER the AsyncLocalStorage scope has been
 * popped, and the pre-hook would see no context at all. Awaiting inside keeps
 * execution within the scope.
 *
 * Do NOT use this to set up data a test then reads back through the API: that
 * would bypass the very scoping under test. Prefer going through endpoints.
 */
export async function asSystem<T>(fn: () => Promise<T> | T): Promise<T> {
  return TenantContext.runAsSystem(async () => await fn());
}
