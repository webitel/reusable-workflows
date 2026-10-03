import { test, before } from 'node:test'
import assert from 'node:assert/strict'

let Git

before(async () => {
    // git.js reads inputs through config.js at import time.
    process.env.INPUT_GH_PAT = 'token'
    process.env.GITHUB_REPOSITORY = 'owner/source'
    process.env.GITHUB_RUN_ID = '42'
    Git = (await import('../src/git.js')).default
})

function gitWithExistingPr(calls) {
    const git = new Git()
    git.repo = { user: 'owner', name: 'target' }
    git.existingPr = { number: 7 }
    git.github = {
        pulls: {
            update: async (args) => {
                calls.push(args)
                return { data: { number: 7 } }
            }
        }
    }
    return git
}

test('updating an existing PR keeps the computed title', async () => {
    const calls = []
    await gitWithExistingPr(calls).createOrUpdatePr('', 'feat(golang)[PE-117]: take version metadata')
    assert.equal(calls[0].title, 'feat(golang)[PE-117]: take version metadata')
})

test('updating an existing PR falls back to the default title', async () => {
    const calls = []
    await gitWithExistingPr(calls).createOrUpdatePr('', undefined)
    assert.equal(calls[0].title, '🔄 synced file(s) with owner/source')
})

test('PR body links to the file-sync action directory', async () => {
    const calls = []
    await gitWithExistingPr(calls).createOrUpdatePr('', undefined)
    assert.match(calls[0].body, /\(https:\/\/github\.com\/webitel\/reusable-workflows\/tree\/main\/actions\/file-sync\)/)
})
