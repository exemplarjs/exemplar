import { defineConfig } from 'vitest/config';

/** Every library package's tests and the examples in one run, with one coverage report across the packages. */
export default defineConfig({
  test: {
    projects: ['./packages/*', './examples'],
    coverage: {
      provider: 'v8',
      // lcov for SonarQube Cloud.
      reporter: ['text', 'json', 'json-summary', 'lcovonly'],
      reportOnFailure: true,
      include: ['packages/*/src/**/*.ts'],
      thresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
    },
  },
});
