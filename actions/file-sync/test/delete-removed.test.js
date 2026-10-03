import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as yaml from 'js-yaml'

import { createSandbox } from './support/harness.js'

const TARGET = 'webitel/target'
const entry = (name, extra = '') => `  - source: golang/${ name }\n    dest: ${ name }\n${ extra }`
const config = (...entries) => `webitel/target:\n${ entries.join('') }`

async function syncedAB() {
    const sandbox = await createSandbox()
    await sandbox.createTarget(TARGET)
    await sandbox.commitSource('initial', {
        '.github/sync.yml': config(entry('a.yml'), entry('b.yml')),
        'golang/a.yml': '1\n',
        'golang/b.yml': '1\n'
    })
    assert.equal((await sandbox.runAction({ inputs: { SKIP_PR: true } })).failed, false)
    return sandbox
}

const managed = (sandbox) => Object.keys(yaml.load(sandbox.readTarget(TARGET, 'main', '.github/file-sync/sync.yml')).files)

test('deletes a managed file removed from the sync config', async () => {
    const sandbox = await syncedAB()
    await sandbox.commitSource('feat[PE-1]: stop syncing b', { '.github/sync.yml': config(entry('a.yml')) })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.readTarget(TARGET, 'main', 'b.yml'), undefined)
    assert.deepEqual(managed(sandbox), [ 'a.yml' ])
    assert.match(sandbox.targetLog(TARGET, 'main~1..main'), /^chore\(sync\)\[PE-1\]: stop syncing b\n[\s\S]*\n- D b\.yml \(was golang\/b\.yml\)\n/)
})

test('keeps the file but stops managing it with DELETE_REMOVED=false', async () => {
    const sandbox = await syncedAB()
    await sandbox.commitSource('stop syncing b', { '.github/sync.yml': config(entry('a.yml')) })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true, DELETE_REMOVED: false } })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.readTarget(TARGET, 'main', 'b.yml'), '1')
    assert.deepEqual(managed(sandbox), [ 'a.yml' ])
})

test('keeps a file whose config entry switched to replace: false', async () => {
    const sandbox = await syncedAB()
    await sandbox.commitSource('hand b over', { '.github/sync.yml': config(entry('a.yml'), entry('b.yml', '    replace: false\n')) })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.readTarget(TARGET, 'main', 'b.yml'), '1')
    assert.deepEqual(managed(sandbox), [ 'a.yml' ])
})

test('keeps a file whose configured source is missing', async () => {
    const sandbox = await syncedAB()
    await sandbox.commitSource('move b away by mistake', { 'golang/b.yml': null })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.match(result.output, /::warning::Source golang\/b\.yml not found/)
    assert.equal(sandbox.readTarget(TARGET, 'main', 'b.yml'), '1')
})
