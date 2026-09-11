import { writeFileSync } from 'node:fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Transaction tests (school approval) need a real replica set, not a
 * standalone mongod — a single-member MongoMemoryReplSet gives us that
 * without needing Docker. Runs once, in Jest's main process; the instance
 * is stashed on `global` so mongo-global-teardown.ts (same process) can
 * stop it again.
 */
export default async function globalSetup(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  (global as unknown as { __MONGO_RS__: MongoMemoryReplSet }).__MONGO_RS__ = replSet;
  writeFileSync(`${__dirname}/.mongo-uri.json`, JSON.stringify({ uri: replSet.getUri('sms_test') }));
}
