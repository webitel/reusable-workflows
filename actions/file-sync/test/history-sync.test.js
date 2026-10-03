import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandbox } from './support/harness.js'

const CONFIG = `
files:
  - source: golang/a.yml
    dest: a.yml
repos:
  webitel/target:
`

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
