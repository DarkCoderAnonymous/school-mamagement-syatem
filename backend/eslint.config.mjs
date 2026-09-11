import globals from 'globals';
import base from '../eslint.config.base.mjs';

export default [
  ...base,
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
];
