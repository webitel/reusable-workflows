import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        watch: false,
        coverage: {
            provider: 'v8',
            all: false,
            enabled: true,
            reporter: ["text"],
            thresholds: { lines: 100, functions: 100, statements: 100, branches: 95 },
        },
    },
});