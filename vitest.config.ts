import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest config — testes unitários puros que não precisam de browser.
 *
 * Inclui só `tests/**` e `lib/**\/*.test.ts`. Não toca em arquivos do
 * Next (app/, pages/) — testes de UI ficam pra futuro com Playwright.
 *
 * Usa o alias `@/` igual ao tsconfig pra reaproveitar imports.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
