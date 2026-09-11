/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  globalSetup: '<rootDir>/test/mongo-global-setup.ts',
  globalTeardown: '<rootDir>/test/mongo-global-teardown.ts',
  setupFiles: ['<rootDir>/test/set-env.ts'],
  testTimeout: 30000,
  // The suite points REDIS_URL at a dead port on purpose (see test/set-env.ts),
  // and ioredis 6.0.0 leaves a handle behind when a client that never reached a
  // reachable host is disconnected — `--detectOpenHandles` can't even attribute
  // it. That stalls exit by ~5s and prints a "did not exit" warning that reads
  // like a leak in our own teardown, which closes everything it opens. Exit
  // once the run is done rather than chase an upstream handle.
  forceExit: true,
};
