/**
 * Stops the seed scripts from running against a database that isn't a local
 * development one.
 *
 * `npm run seed` starts by wiping every school, user, membership and audit
 * log, and both seed scripts plant accounts with well-known passwords. Run by
 * mistake with a real MONGO_URI in .env (an Atlas cluster, say), that is the
 * whole platform gone and a known super-admin password left in its place. So
 * a seed runs only against localhost — or when someone has explicitly said
 * otherwise with SEED_ALLOW_REMOTE=1 — and never with NODE_ENV=production.
 *
 * Nothing here prints the URI: it usually embeds a password.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'mongodb', 'sms_mongodb']);

/** The host names in a mongodb:// URI, or null when they can't be read (e.g. mongodb+srv://, which is always remote). */
export function mongoHosts(uri: string): string[] | null {
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri.trim());
  if (!match) return null;
  return match[1]!.split(',').map((hostPort) => {
    const host = hostPort.trim().toLowerCase();
    // [::1]:27017 keeps its brackets; host:port loses the port.
    return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]!;
  });
}

export function seedTargetProblem(uri: string, nodeEnv: string | undefined, allowRemote: boolean): string | null {
  if (nodeEnv === 'production') return 'NODE_ENV is production';
  if (allowRemote) return null;
  const hosts = mongoHosts(uri);
  if (!hosts) return 'MONGO_URI is not a plain mongodb:// URI (mongodb+srv:// is always a remote cluster)';
  if (!hosts.every((h) => LOCAL_HOSTS.has(h))) return 'MONGO_URI points at a non-local host';
  return null;
}

/** Call first thing in a seed script, before any connection is opened. Exits the process when the target isn't safe. */
export function assertSafeSeedTarget(scriptName: string): void {
  const problem = seedTargetProblem(
    process.env.MONGO_URI ?? '',
    process.env.NODE_ENV,
    process.env.SEED_ALLOW_REMOTE === '1',
  );
  if (!problem) return;
  // eslint-disable-next-line no-console
  console.error(
    `[${scriptName}] Refusing to run: ${problem}. Seeding wipes data and creates accounts with known passwords, ` +
      'so it only runs against a local development database. If you really mean to seed this database, ' +
      're-run with SEED_ALLOW_REMOTE=1 (never against production).',
  );
  process.exit(1);
}
