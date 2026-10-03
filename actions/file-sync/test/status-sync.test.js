import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandbox } from './support/harness.js'

const CONFIG = `
webitel/target:
  - source: golang/a.yml
    dest: a.yml
`

test('STATUS_ISSUE keeps one comment per stream in a pinned status issue of the source repository', async (t) => {
    const sandbox = await createSandbox()
    const api = await sandbox.startApi()
    t.after(() => api.close())
    await sandbox.createTarget('webitel/target')
    const sha = await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n' })

    const first = await sandbox.runAction({ api, inputs: { STATUS_ISSUE: 'File sync status' } })
    const second = await sandbox.runAction({ api, inputs: { STATUS_ISSUE: 'File sync status' } })

    assert.equal(first.failed, false, first.output)
    assert.equal(second.failed, false, second.output)
    assert.equal(api.state.issues.length, 1)
    const issue = api.state.issues[0]
    assert.equal(issue.repo, 'webitel/source')
    assert.equal(issue.title, 'File sync status')
    assert.match(issue.body, /<!-- file-sync:status -->/)
    assert.equal(api.state.pinned, issue.node_id)

    const comments = api.state.comments.filter((c) => c.repo === 'webitel/source' && c.number === issue.number)
    assert.equal(comments.length, 1)
    assert.match(comments[0].body, /^### sync · `\.github\/sync\.yml`\n/)
    assert.match(comments[0].body, /\| webitel\/target \| — \| \[#1\]\(https:\/\/github\.com\/webitel\/target\/pull\/1\) · since \d{4}-\d{2}-\d{2} \| ⏸️ unchanged \|/)
    assert.match(comments[0].body, new RegExp(`from \\[\`${ sha.slice(0, 7) }\`\\]`))
})

test('the status issue shows the source commit the base branch is synced to', async (t) => {
    const sandbox = await createSandbox()
    const api = await sandbox.startApi()
    t.after(() => api.close())
    await sandbox.createTarget('webitel/target')
    const sha = await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n' })
    await sandbox.runAction({ inputs: { SKIP_PR: true } })

    const result = await sandbox.runAction({ api, inputs: { SKIP_PR: true, STATUS_ISSUE: 'File sync status' } })

    assert.equal(result.failed, false, result.output)
    assert.match(api.state.comments[0].body, new RegExp(`\\| webitel/target \\| \\[\`${ sha.slice(0, 7) }\`\\]\\([^)]+\\) · \\d{4}-\\d{2}-\\d{2} \\|  \\| ✅ up to date \\|`))
})

test('a dry run prints the status comment instead of publishing it', async (t) => {
    const sandbox = await createSandbox()
    const api = await sandbox.startApi()
    t.after(() => api.close())
    await sandbox.createTarget('webitel/target')
    await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n' })

    const result = await sandbox.runAction({ api, inputs: { DRY_RUN: true, STATUS_ISSUE: 'File sync status' } })

    assert.equal(result.failed, false, result.output)
    assert.equal(api.state.issues.length, 0)
    assert.match(result.output, /### sync · `\.github\/sync\.yml`/)
})
