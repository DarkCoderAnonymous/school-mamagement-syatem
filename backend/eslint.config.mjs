import globals from 'globals';
import base from '../eslint.config.base.mjs';

/**
 * Raw driver access bypasses Mongoose middleware entirely, which means it
 * bypasses the tenant-scoping plugin — `Model.collection.find({})` returns
 * every school's documents with no error and no trace. There is no hook that
 * can catch it at runtime, so it is blocked here at lint time instead.
 *
 * `db.collection(...)` off a raw connection is the same hole by another name.
 *
 * If a migration genuinely needs the driver, it belongs in a script with an
 * explicit `// eslint-disable-next-line no-restricted-syntax` and a comment
 * saying why — so the exception is visible in review.
 */
const NO_RAW_DRIVER_ACCESS = [
  {
    selector:
      "MemberExpression[property.name='collection'][object.type='Identifier'][object.name=/^[A-Z]/]",
    message:
      'Raw collection access bypasses the tenant-scoping plugin and can leak across schools. ' +
      'Use the Mongoose model methods, or TenantContext.runAsSystem() in a script if truly needed.',
  },
  {
    selector: "CallExpression[callee.property.name='collection']",
    message:
      'db.collection() bypasses the tenant-scoping plugin and can leak across schools. ' +
      'Use a Mongoose model instead.',
  },
];

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_RAW_DRIVER_ACCESS],
    },
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
];
