import { rmSync } from 'node:fs';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  const replSet = (global as unknown as { __MONGO_RS__?: MongoMemoryReplSet }).__MONGO_RS__;
  if (replSet) await replSet.stop();
  rmSync(`${__dirname}/.mongo-uri.json`, { force: true });
}
