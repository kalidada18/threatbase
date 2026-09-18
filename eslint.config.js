import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Flat ESLint config. Intentionally pragmatic: it establishes a CI gate over the
// existing codebase without drowning it in churn. Genuine correctness issues are
// errors; stylistic / large-backlog items start as warnings so the gate is green
// today and can be tightened incrementally.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.wrangler/**',
      'node_modules/**',
      'public/**',
      'design-system/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx,js,jsx}', 'functions/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'prefer-const': 'warn',
    },
  },
)
