import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        watch: false,
        coverage: {
            provider: 'v8',
            all: false,
            enabled: true,
            reporter: ["text"],
            thresholds: { 100: true },
        },
    },
});