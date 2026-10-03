import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'child_process'
import * as os from 'os'

// config.js reads inputs at import time, so every case runs in a fresh process.
function loadConfig(env) {
    const out = execFileSync(process.execPath, [
        '--input-type=module',
        '-e',
        'const { default: c } = await import("./src/config.js"); console.log(JSON.stringify(c))'
    ], {
        cwd: new URL('..', import.meta.url),
        env: { PATH: process.env.PATH, INPUT_GH_PAT: 'token', GITHUB_REPOSITORY: 'owner/source', ...env },
        encoding: 'utf8'
    })
    return JSON.parse(out.trim().split('\n').pop())
}

test('COMMIT_PREFIX defaults to 🔄 when the input is not set', () => {
    assert.equal(loadConfig({}).COMMIT_PREFIX, '🔄')
})

test('COMMIT_PREFIX can be disabled with an empty input', () => {
    assert.equal(loadConfig({ INPUT_COMMIT_PREFIX: '' }).COMMIT_PREFIX, '')
})

test('COMMIT_PREFIX uses a custom input', () => {
    assert.equal(loadConfig({ INPUT_COMMIT_PREFIX: 'sync:' }).COMMIT_PREFIX, 'sync:')
})
