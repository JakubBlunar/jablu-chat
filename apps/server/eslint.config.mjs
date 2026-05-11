import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/generated'] },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        // Pin the parser to this app so tseslint doesn't try to auto-pick
        // between apps/server and apps/web when ESLint is run from the repo root.
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
)
