import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TENANT_MODELS } from '../test/cross-tenant/registry';

/**
 * Fails the build if a tenant-owned model isn't registered with the
 * cross-tenant harness.
 *
 * The harness generates its probes from the registry, which means an
 * unregistered model gets NO isolation coverage at all — and its absence is
 * invisible, because the suite still passes. That is the worst failure mode
 * available to a security test: silent, and confidence-inspiring.
 *
 * Source of truth is the filesystem, not a list someone maintains: any schema
 * built with `createTenantSchema` is tenant-owned by definition.
 */

const MODELS_DIR = join(__dirname, '..', 'src', 'models');

/** `model<FooDoc>('Foo', schema)` / `model('Foo', schema)` → "Foo". */
const MODEL_NAME = /\bmodel(?:<[^>]*>)?\(\s*'([^']+)'/;

function tenantModelNamesOnDisk(): string[] {
  const names: string[] = [];

  for (const file of readdirSync(MODELS_DIR)) {
    if (!file.endsWith('.ts') || file === 'base.ts') continue;

    const source = readFileSync(join(MODELS_DIR, file), 'utf8');
    // createPlatformSchema models are global by design (User, Role, Plan,
    // School, AuditLog...) and are correctly absent from the registry.
    if (!source.includes('createTenantSchema')) continue;

    const match = MODEL_NAME.exec(source);
    if (!match) {
      throw new Error(`Could not determine the model name in models/${file}`);
    }
    names.push(match[1]!);
  }

  return names.sort();
}

function main(): void {
  const onDisk = tenantModelNamesOnDisk();
  const registered = new Set(TENANT_MODELS.map((entry) => entry.model.modelName));

  const missing = onDisk.filter((name) => !registered.has(name));
  const stale = [...registered].filter((name) => !onDisk.includes(name));

  /* eslint-disable no-console */
  console.log(`Tenant-owned models on disk: ${onDisk.length}`);
  console.log(`Registered with the harness:  ${registered.size}`);

  if (stale.length > 0) {
    console.warn(`\nRegistered but no longer tenant-owned: ${stale.join(', ')}`);
    console.warn('Remove these from test/cross-tenant/registry.ts.');
  }

  if (missing.length > 0) {
    console.error(`\n✗ ${missing.length} tenant-owned model(s) have NO cross-tenant coverage:\n`);
    for (const name of missing) console.error(`    ${name}`);
    console.error('\nAdd an entry to backend/test/cross-tenant/registry.ts (TENANT_MODELS).');
    console.error('A module is not done until it is registered — see the definition of done in');
    console.error('docs/school-saas-build-prompt.md.\n');
    process.exit(1);
  }

  console.log('\n✓ Every tenant-owned model is registered with the cross-tenant harness.');
  /* eslint-enable no-console */
}

main()
