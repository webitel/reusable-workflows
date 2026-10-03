import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandbox } from './support/harness.js'

const CONFIG = `
files:
  - source: configs/a.yml
    dest: a.yml
  - source: configs/dir/
    dest: dir/
repos:
  webitel/target:
`

test('pushes synced files directly to the base branch with SKIP_PR', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    await sandbox.commitSource('add configs', {
        '.github/sync.yml': CONFIG,
        'configs/a.yml': 'a: 1\n',
        'configs/dir/b.yml': 'b: 1\n'
    })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.readTarget('webitel/target', 'main', 'a.yml'), 'a: 1')
    assert.equal(sandbox.readTarget('webitel/target', 'main', 'dir/b.yml'), 'b: 1')
})
