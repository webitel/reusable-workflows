import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandbox } from './support/harness.js'

const CONFIG = `
webitel/target:
  - source: golang/a.yml
    dest: a.yml
`

test('logs the source commits that changed the synced files since the last sync', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    const anchor = await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n' })
    await sandbox.runAction({ inputs: { SKIP_PR: true } })

    const change = await sandbox.commitSource('feat(golang)[PE-117]: change a', { 'golang/a.yml': '2\n' })
    await sandbox.commitSource('docs: unrelated', { 'README.md': 'docs\n' })
    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.match(result.output, new RegExp(`Source commits ${ anchor.slice(0, 7) }\\.\\.[0-9a-f]{7}:\\n- ${ change.slice(0, 7) } feat\\(golang\\)\\[PE-117\\]: change a\\n`))
    assert.doesNotMatch(result.output, /docs: unrelated/)
})

test('warns when the source checkout is shallow', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target', {
        '.github/file-sync/sync.yml': 'version: 1\nsource:\n  sha: ' + 'f'.repeat(40) + '\nfiles: {}\n'
    })
    await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n' })
    // Simulates actions/checkout without fetch-depth: 0
    await sandbox.makeSourceShallow()

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.match(result.output, /::warning::The source checkout is shallow; check it out with fetch-depth: 0 to list source commits/)
})
