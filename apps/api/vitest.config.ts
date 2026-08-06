import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Sets the environment env.ts insists on before any module imports it.
    setupFiles: ['src/test/setup.ts'],
    // Applies the migrations to TEST_DATABASE_URL, when there is one.
    globalSetup: ['src/test/global-setup.ts'],
    // The route tests share one database, so they must not interleave.
    fileParallelism: false,
  },
})
