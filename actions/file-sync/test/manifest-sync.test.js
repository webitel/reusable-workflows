import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as yaml from 'js-yaml'

import { createSandbox } from './support/harness.js'
import { serializeManifest, sha256 } from '../src/manifest.js'

const CONFIG = `
webitel/target:
  - source: configs/a.yml
    dest: a.yml
  - source: configs/dir/
    dest: dir/
  - source: configs/once.yml
    dest: once.yml
    replace: false
`

const SOURCE_FILES = {
    '.github/sync.yml': CONFIG,
    'configs/a.yml': 'a: 1\n',
    'configs/dir/b.yml': 'b: 1\n',
    'configs/once.yml': 'once: 1\n'
}

function readManifest(sandbox, name = 'sync') {
    const text = sandbox.readTarget('webitel/target', 'main', `.github/file-sync/${ name }.yml`)
    return text === undefined ? undefined : yaml.load(text)
}

test('writes a manifest of the synced files into the sync commit', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    const sha = await sandbox.commitSource('add configs', SOURCE_FILES)

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.deepEqual(readManifest(sandbox), {
        version: 1,
        source: { repository: 'webitel/source', config: '.github/sync.yml', sha },
        files: {
            'a.yml': { source: 'configs/a.yml', sha256: sha256('a: 1\n') },
            'dir/b.yml': { source: 'configs/dir/b.yml', sha256: sha256('b: 1\n') }
        }
    })
})

test('names the manifest after the SYNC_NAME input', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    await sandbox.commitSource('add configs', SOURCE_FILES)

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true, SYNC_NAME: 'golang' } })

    assert.equal(result.failed, false, result.output)
    assert.notEqual(readManifest(sandbox, 'golang'), undefined)
    assert.equal(readManifest(sandbox, 'sync'), undefined)
})

test('does not commit when only unrelated source files changed', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    await sandbox.commitSource('add configs', SOURCE_FILES)
    await sandbox.runAction({ inputs: { SKIP_PR: true } })
    const before = sandbox.targetLog('webitel/target', 'main', '%H')

    await sandbox.commitSource('unrelated', { 'README.md': 'docs\n' })
    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.targetLog('webitel/target', 'main', '%H'), before)
})

test('adds the manifest to a repository whose files are already in sync', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target', { 'a.yml': 'a: 1\n', 'dir/b.yml': 'b: 1\n', 'once.yml': 'local\n' })
    await sandbox.commitSource('add configs', SOURCE_FILES)

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.deepEqual(Object.keys(readManifest(sandbox).files), [ 'a.yml', 'dir/b.yml' ])
})

test('warns when another stream already owns a synced file', async () => {
    const sandbox = await createSandbox()
    const other = serializeManifest({
        name: 'static', repository: 'webitel/source', config: 'static.yml', sha: 'x',
        files: { 'a.yml': { source: 'static/a.yml', sha256: 'y' } }
    })
    await sandbox.createTarget('webitel/target', { '.github/file-sync/static.yml': other })
    await sandbox.commitSource('add configs', SOURCE_FILES)

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.match(result.output, /::warning::a\.yml is also managed by the "static" sync stream/)
})
