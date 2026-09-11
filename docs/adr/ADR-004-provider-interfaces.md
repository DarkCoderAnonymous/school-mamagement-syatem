# ADR-004 — External provider interfaces

- **Status:** Accepted
- **Date:** 2026-09-12

## Context

The product needs SMS, email, push notifications, file storage and payment
collection. Each has a different vendor per region — a Pakistani school's SMS
gateway is not a Kenyan one's — and tests must never send a real message or
take a real payment.

## Decision

Each capability sits behind a narrow interface in `backend/src/providers/`,
selected by environment variable, with a console/fake implementation used in
development and tests.

```ts
interface SmsProvider    { send(to: string, body: string, ctx: TenantCtx): Promise<SmsResult> }
interface EmailProvider  { send(message: EmailMessage): Promise<void> }
interface PushProvider   { send(tokens: string[], message: PushMessage): Promise<PushResult> }
interface StorageService { put(key, body, contentType): Promise<void>
                           signedUrl(key, ttlSeconds): Promise<string>
                           delete(key): Promise<void> }
interface PaymentProvider{ createIntent(input): Promise<PaymentIntent>
                           verifyWebhook(raw, signature): WebhookEvent }
```

Rules that apply to all of them:

- **Keys are tenant-prefixed.** `StorageService` keys start
  `schools/{schoolId}/`, and a tenant check runs before any signed URL is
  issued. A signed URL is short-lived; files are never public.
- **Metered sends are checked first.** SMS consumes plan credits, so it goes
  through `PlanLimitService` before the provider is called.
- **Payments are idempotent.** `createIntent` takes an idempotency key, and
  webhook handling is keyed on the provider's event id so a redelivery cannot
  double-credit an invoice.
- **Providers are called from jobs, not requests** (ADR-003), except where the
  user must see the result immediately.

Push uses Expo (`expo-server-sdk`) to match the mobile app.

## Consequences

One more indirection for every external call, and each provider needs a fake
kept honest — a fake that cannot fail teaches nothing, so the fakes simulate
failure modes (rejected number, expired token, duplicate webhook).

In exchange: tests run offline, dev needs no vendor account, and a school in a
new country is a provider implementation rather than a change to business
logic.
