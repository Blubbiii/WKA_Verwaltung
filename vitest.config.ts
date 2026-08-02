import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Setzt die von src/lib/env.ts geforderten Env-Vars, damit Tests, die
    // transitiv Prisma importieren, nicht schon beim Laden abreissen.
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    // 30 s statt der voreingestellten 5.
    //
    // Zwoelf Testdateien pruefen keine Rechenfunktion, sondern eine
    // Konvention — und lesen dafuer den ganzen Quellbaum (Konventionen,
    // UX-Stufen, Download-Muster, Zaehler auf weich Geloeschtem). Das ist
    // Dateizugriff, keine Rechenzeit, und laeuft parallel zu hundert anderen
    // Dateien. Fuenf Sekunden reichten dafuer mal und mal nicht: derselbe
    // Test war allein gruen und im Gesamtlauf rot.
    //
    // Ein Test, der je nach Nachbarn kippt, ist schlimmer als ein langsamer —
    // man gewoehnt sich an, ihn nicht ernst zu nehmen. Die ganze Suite
    // braucht rund 13 Sekunden; eine hoehere Schranke kostet hier nichts und
    // schlaegt erst an, wenn wirklich etwas haengt.
    testTimeout: 30_000,
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', '.next/', 'src/types/'],
      // Initial baseline thresholds — raise gradually as more tests land.
      // Critical money paths (invoice-generator, dunning, settlement-calc) should
      // reach 80%+ before raising the global threshold.
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
        statements: 30,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
