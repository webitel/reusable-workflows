import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandbox } from './support/harness.js'

const CONFIG = `
files:
  - source: golang/a.yml
    dest: a.yml
  - source: golang/b.yml
    dest: b.yml
repos:
  webitel/target:
`
const BRANCH = 'repo-sync/source/default'
const TARGET = 'webitel/target'

// A target synced once (merged), then an open sync PR for one source change.
async function withOpenPr(t) {
    const sandbox = await createSandbox()
    const api = await sandbox.startApi()
    t.after(() => api.close())

    await sandbox.createTarget(TARGET)
    await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n', 'golang/b.yml': '1\n' })
    assert.equal((await sandbox.runAction({ inputs: { SKIP_PR: true } })).failed, false)

    const first = await sandbox.commitSource('feat(golang)[PE-117]: change a', { 'golang/a.yml': '2\n' })
    const result = await sandbox.runAction({ api })
    assert.equal(result.failed, false, result.output)
    assert.equal(api.state.pulls.length, 1)

    return { sandbox, api, first, pr: api.state.pulls[0] }
}

const patches = (api) => api.state.requests.filter((r) => r.method === 'PATCH')

test('a new sync while the PR is open accumulates into the same PR and logs a journal comment', async (t) => {
    const { sandbox, api, pr } = await withOpenPr(t)
    const second = await sandbox.commitSource('fix(golang)[PE-118]: change b', { 'golang/b.yml': '2\n' })

    const result = await sandbox.runAction({ api })

    assert.equal(result.failed, false, result.output)
    assert.equal(api.state.pulls.length, 1)
    assert.equal(pr.title, 'chore(sync)[PE-117,PE-118]: 2 changes from webitel/source')
    assert.deepEqual(sandbox.targetLog(TARGET, `main..${ BRANCH }`, '%s').split('\n'), [ pr.title ])
    assert.equal(api.state.comments.length, 1)
    assert.match(api.state.comments[0].body, /^Updated by run \[#42\]/)
    assert.match(api.state.comments[0].body, new RegExp(`${ second.slice(0, 7) }\`\\]\\([^)]+\\) fix\\(golang\\)\\[PE-118\\]: change b`))
    assert.doesNotMatch(api.state.comments[0].body, /PE-117/)
})

test('does not push or edit the PR when its content would not change', async (t) => {
    const { sandbox, api } = await withOpenPr(t)
    const head = sandbox.branchHead(TARGET, BRANCH)
    const patchesBefore = patches(api).length
    await sandbox.commitSource('docs: unrelated', { 'README.md': 'docs\n' })

    const result = await sandbox.runAction({ api })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.branchHead(TARGET, BRANCH), head)
    assert.equal(patches(api).length, patchesBefore)
    assert.equal(api.state.comments.length, 0)
})

test('skips a PR branch with commits file-sync did not create and comments once', async (t) => {
    const { sandbox, api } = await withOpenPr(t)
    await sandbox.commitTarget(TARGET, BRANCH, 'fix CI by hand', { 'ci.txt': 'manual\n' })
    const head = sandbox.branchHead(TARGET, BRANCH)
    await sandbox.commitSource('fix(golang)[PE-118]: change b', { 'golang/b.yml': '2\n' })

    const first = await sandbox.runAction({ api })
    const second = await sandbox.runAction({ api })

    assert.equal(sandbox.branchHead(TARGET, BRANCH), head)
    assert.match(first.output, /::warning::.*commits that file-sync did not create/)
    assert.equal(second.failed, false, second.output)
    assert.equal(api.state.comments.length, 1)
    assert.match(api.state.comments[0].body, /fix CI by hand/)
})

test('closes the PR and deletes its branch when the source change is reverted', async (t) => {
    const { sandbox, api, pr } = await withOpenPr(t)
    await sandbox.commitSource('revert: change a', { 'golang/a.yml': '1\n' })

    const result = await sandbox.runAction({ api })

    assert.equal(result.failed, false, result.output)
    assert.equal(pr.state, 'closed')
    assert.equal(sandbox.targetHasBranch(TARGET, BRANCH), false)
    assert.match(api.state.comments[0].body, /^Closed by run \[#42\]/)
})

test('rebuilding the PR no longer adds a resync warning to its body', async (t) => {
    const { sandbox, api, pr } = await withOpenPr(t)
    await sandbox.commitSource('fix(golang)[PE-118]: change b', { 'golang/b.yml': '2\n' })

    await sandbox.runAction({ api })

    assert.doesNotMatch(pr.body, /automatically resynced/)
    assert.equal(patches(api).length, 1)
})
