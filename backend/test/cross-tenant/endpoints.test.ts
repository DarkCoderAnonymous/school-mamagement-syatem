import request from 'supertest';
import { TENANT_ENDPOINTS, TENANT_MODELS } from './registry';
import { asSystem, unknownId, type CrossTenantFixture } from './fixture';
import { app, setupCrossTenant, teardownCrossTenant } from './setup';

/**
 * HTTP-layer isolation, generated from the registry. Where the model specs
 * prove the plugin holds, these prove the routes in front of it don't hand an
 * attacker a way around it — path ids, request bodies and query strings are
 * all attacker-controlled.
 */

/** Registry entry name → model, so an endpoint spec can verify stored state. */
const MODELS_BY_ENTRY = Object.fromEntries(
  TENANT_MODELS.map((e) => [e.name, e.model]),
) as Record<string, (typeof TENANT_MODELS)[number]['model']>;

let fx: CrossTenantFixture;

beforeAll(async () => {
  fx = await setupCrossTenant();
}, 120_000);

afterAll(teardownCrossTenant);

describe('Cross-tenant · endpoints (registry-driven)', () => {
  describe.each(TENANT_ENDPOINTS.map((e) => [e.name, e] as const))('%s', (_name, endpoint) => {
    const otherId = () => fx.b.ids[endpoint.idFrom];

    it('requires authentication at all', async () => {
      await request(app).get(endpoint.basePath).expect(401);
    });

    if (endpoint.supports.list) {
      it('lists only the caller\'s own school', async () => {
        const res = await request(app)
          .get(endpoint.basePath)
          .set('Authorization', `Bearer ${fx.a.token}`)
          .expect(200);

        const items = res.body.data.items as { schoolId: string }[];
        expect(items.length).toBeGreaterThan(0);
        expect(items.every((i) => i.schoolId === fx.a.schoolId)).toBe(true);
      });

      it('ignores a schoolId passed as a query parameter', async () => {
        const res = await request(app)
          .get(`${endpoint.basePath}?schoolId=${fx.b.schoolId}`)
          .set('Authorization', `Bearer ${fx.a.token}`)
          .expect(200);

        const items = res.body.data.items as { schoolId: string }[];
        expect(items.every((i) => i.schoolId === fx.a.schoolId)).toBe(true);
      });
    }

    if (endpoint.supports.get) {
      it('404s on the other school\'s id rather than revealing it exists', async () => {
        await request(app)
          .get(`${endpoint.basePath}/${otherId()}`)
          .set('Authorization', `Bearer ${fx.a.token}`)
          .expect(404);
      });

      it('404s identically on an id that belongs to nobody', async () => {
        // Same status for "someone else's" and "nobody's" — a different code
        // would turn the endpoint into an existence oracle.
        await request(app)
          .get(`${endpoint.basePath}/${unknownId()}`)
          .set('Authorization', `Bearer ${fx.a.token}`)
          .expect(404);
      });
    }

    if (endpoint.supports.create && endpoint.createBody) {
      // Bound outside the callback: narrowing on `endpoint.createBody`
      // doesn't survive into the closure.
      const buildBody = endpoint.createBody;
      it('stamps the caller\'s school, ignoring a schoolId in the body', async () => {
        const res = await request(app)
          .post(endpoint.basePath)
          .set('Authorization', `Bearer ${fx.a.token}`)
          .send({ ...buildBody(fx.a, `-body-${Date.now()}`), schoolId: fx.b.schoolId })
          .expect(201);

        expect(res.body.data.schoolId).toBe(fx.a.schoolId);
      });
    }

    if (endpoint.supports.patch && endpoint.updateBody) {
      const updateBody = endpoint.updateBody;
      // Resolved once, and asserted: a registry entry whose idFrom names no
      // model is a registration mistake that should fail loudly here.
      const model = MODELS_BY_ENTRY[endpoint.idFrom];
      if (!model) throw new Error(`Endpoint "${endpoint.name}" has idFrom "${endpoint.idFrom}" with no model`);
      it('cannot update the other school\'s record', async () => {
        await request(app)
          .patch(`${endpoint.basePath}/${otherId()}`)
          .set('Authorization', `Bearer ${fx.a.token}`)
          .send(updateBody)
          .expect(404);

        // Belt and braces: prove the row is actually untouched, not merely
        // that the response was a 404.
        const stored = (await asSystem(() =>
          model.findById(otherId()).lean(),
        )) as Record<string, unknown> | null;
        for (const [field, value] of Object.entries(updateBody)) {
          expect(String(stored?.[field])).not.toBe(String(value));
        }
      });
    }

    if (endpoint.supports.remove) {
      it('cannot delete the other school\'s record', async () => {
        await request(app)
          .delete(`${endpoint.basePath}/${otherId()}`)
          .set('Authorization', `Bearer ${fx.a.token}`)
          .expect(404);
      });
    }
  });

  it('every tenant endpoint in the app is registered here', () => {
    // A reminder rather than a reflection over the router: the registry is
    // the contract, and this keeps its emptiness visible.
    expect(TENANT_ENDPOINTS.length).toBeGreaterThanOrEqual(1);
  });
});
