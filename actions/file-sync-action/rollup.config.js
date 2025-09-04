import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';
import json from "@rollup/plugin-json";

export default {
    input: 'src/index.js',
    output: {
        file: 'dist/index.js',
        format: 'esm',                // use 'cjs' if you want CommonJS
    },
    plugins: [
        resolve({ preferBuiltins: true }),
        commonjs(),
        json(),
        esbuild({
            target: 'node20',
            minify: false
        }),
    ],
    external: ['fs', 'path', 'os'] // Node built-ins, don’t bundle
};
