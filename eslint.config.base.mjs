// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Shared flat config for the TypeScript/Node workspaces (backend, shared).
 *
 * `frontend` and `mobile` bring their own flat configs from
 * eslint-config-next and eslint-config-expo respectively — those framework
 * presets already cover React/React Native rules this base has no opinion on.
 * The whole repo is on ESLint 9 flat config so a single hoisted ESLint
 * satisfies every workspace; the classic .eslintrc format used here before
 * pinned the root to ESLint 8, which broke `expo lint`.
 */
export default [
  {
    ignores: ['dist/**', 'build/**', '.next/**', 'node_modules/**', 'coverage/**', '*.config.js'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript resolves identifiers itself, and no-undef can't see type-only
      // namespaces like `NodeJS.Timeout` — typescript-eslint's own guidance is to
      // switch it off rather than chase false positives.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // CLAUDE.md: no `any` without a comment justifying it.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Server logging goes through this deliberately today; every call site
      // already carries an explicit disable comment, and Phase 3 replaces them
      // with structured logging (pino).
      'no-console': 'warn',
    },
  },
  prettier,
];
