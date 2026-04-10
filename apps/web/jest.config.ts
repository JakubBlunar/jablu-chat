import type { Config } from 'jest'

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.test\\.tsx?$',
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
          target: 'es2022'
        },
        module: { type: 'commonjs' }
      }
    ]
  },
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/jest-setup-i18n.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@chat/shared$': '<rootDir>/../../packages/shared/dist/cjs/index.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(zustand|@testing-library)/)'
  ],
}

export default config
