import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandbox } from './support/harness.js'

const CONFIG = `
webitel/target:
  - source: golang/a.yml
    dest: a.yml
  - source: golang/b.yml
    dest: b.yml
`
const TARGET = 'webitel/target'

// A target synced once, then edited by a developer directly on main.
async function withLocalEdits(t) {
    const sandbox = await createSandbox()
    const api = await sandbox.startApi()
    t.after(() => api.close())

    await sandbox.createTarget(TARGET)
    await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n', 'golang/b.yml': '1\n' })
    assert.equal((await sandbox.runAction({ inputs: { SKIP_PR: true } })).failed, false)
    await sandbox.commitTarget(TARGET, 'main', 'tweak a by hand', { 'a.yml': 'local\n' })

    return { sandbox, api }
}

test('reports local changes of synced files in the pull request and restores them', async (t) => {
    const { sandbox, api } = await withLocalEdits(t)

    const result = await sandbox.runAction({ api })

    assert.equal(result.failed, false, result.output)
    assert.match(result.output, /::warning::a\.yml was changed in webitel\/target after the last sync; the sync overwrites it/)
    const pr = api.state.pulls.at(-1)
    assert.match(pr.body, /### ⚠️ Local changes overwritten\n.*\n- `a\.yml`\n/)
    assert.doesNotMatch(pr.body, /`b\.yml`\n/)
    assert.equal(sandbox.readTarget(TARGET, 'repo-sync/source/default', 'a.yml'), '1')
})

test('ON_DRIFT=fail fails the repository and opens no pull request', async (t) => {
    const { sandbox, api } = await withLocalEdits(t)

    const result = await sandbox.runAction({ api, inputs: { ON_DRIFT: 'fail' } })

    assert.match(result.output, /::error::webitel\/target: a\.yml was changed after the last sync and ON_DRIFT is fail/)
    assert.equal(api.state.pulls.length, 0)
})
