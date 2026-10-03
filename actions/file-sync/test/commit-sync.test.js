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

async function syncedOnce() {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    const anchor = await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n', 'golang/b.yml': '1\n' })
    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })
    assert.equal(result.failed, false, result.output)
    return { sandbox, anchor }
}

test('first sync names the source commit in a single commit', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    const sha = await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n', 'golang/b.yml': '1\n' })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.deepEqual(sandbox.targetLog('webitel/target', 'main', '%s').split('\n'), [
        `chore(sync): sync files from webitel/source@${ sha.slice(0, 7) }`,
        'initial'
    ])
})

test('sync commit describes the source commits, files and trailers', async () => {
    const { sandbox, anchor } = await syncedOnce()
    const change = await sandbox.commitSource('feat(golang)[PE-117]: change a', { 'golang/a.yml': '2\n' })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.targetLog('webitel/target', 'main~1..main'), [
        'chore(sync)[PE-117]: change a',
        '',
        `Source: webitel/source ${ anchor.slice(0, 7) }..${ change.slice(0, 7) } (.github/sync.yml)`,
        '',
        'Changes:',
        `- feat(golang)[PE-117]: change a (${ change.slice(0, 7) })`,
        '',
        'Files:',
        '- M a.yml <- golang/a.yml',
        '',
        `Synced-From: webitel/source@${ change }`,
        'Sync-Config: .github/sync.yml',
        'Sync-Run: https://github.com/webitel/source/actions/runs/42'
    ].join('\n'))
})

test('TITLE_PREFIX replaces the default prefix', async () => {
    const { sandbox } = await syncedOnce()
    await sandbox.commitSource('feat(golang)[PE-117]: change a', { 'golang/a.yml': '2\n' })

    await sandbox.runAction({ inputs: { SKIP_PR: true, TITLE_PREFIX: 'ci(sync)' } })

    assert.equal(sandbox.targetLog('webitel/target', 'main~1..main', '%s'), 'ci(sync)[PE-117]: change a')
})

test('opens a pull request titled and described after the sync commit', async (t) => {
    const { sandbox } = await syncedOnce()
    const api = await sandbox.startApi()
    t.after(() => api.close())
    await sandbox.commitSource('feat(golang)[PE-117]: change a', { 'golang/a.yml': '2\n' })
    await sandbox.commitSource('fix(golang)[PE-118]: change b', { 'golang/b.yml': '2\n' })

    const result = await sandbox.runAction({ api })

    assert.equal(result.failed, false, result.output)
    assert.deepEqual(sandbox.targetLog('webitel/target', `main..${ BRANCH }`, '%s').split('\n'), [
        'chore(sync)[PE-117,PE-118]: 2 changes from webitel/source'
    ])
    const pr = api.state.pulls.at(-1)
    assert.equal(pr.title, 'chore(sync)[PE-117,PE-118]: 2 changes from webitel/source')
    assert.match(pr.body, /### Source changes/)
    assert.match(pr.body, /\| M \| `a\.yml` \|/)
    assert.match(pr.body, /\| M \| `b\.yml` \|/)
    assert.deepEqual(pr.labels.map((l) => l.name), [ 'sync' ])
})

test('dry run prints the commit message and pushes nothing', async (t) => {
    const { sandbox } = await syncedOnce()
    const api = await sandbox.startApi()
    t.after(() => api.close())
    await sandbox.commitSource('feat(golang)[PE-117]: change a', { 'golang/a.yml': '2\n' })

    const result = await sandbox.runAction({ api, inputs: { DRY_RUN: true } })

    assert.equal(result.failed, false, result.output)
    assert.match(result.output, /chore\(sync\)\[PE-117\]: change a/)
    assert.equal(sandbox.targetHasBranch('webitel/target', BRANCH), false)
})
