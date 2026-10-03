import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'

import { git } from './support/harness.js'
import { sourceCommits, jiraKeys } from '../src/history.js'

async function sourceRepo() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-sync-history-'))
    git(dir, 'init', '-q', '-b', 'main')
    const commit = async (message, files) => {
        for (const [ file, content ] of Object.entries(files)) await fs.outputFile(path.join(dir, file), content)
        git(dir, 'add', '-A')
        git(dir, 'commit', '-q', '-m', message)
        return git(dir, 'rev-parse', 'HEAD')
    }
    return { dir, commit }
}

test('lists commits since the anchor that touched the given paths, oldest first', async () => {
    const repo = await sourceRepo()
    const anchor = await repo.commit('initial', { 'golang/a.yml': '1', 'python/b.yml': '1' })
    const first = await repo.commit('feat(golang)[PE-117]: change a', { 'golang/a.yml': '2' })
    await repo.commit('feat(python)[PE-200]: change b', { 'python/b.yml': '2' })
    const third = await repo.commit('fix(golang)[PE-118]: change a again', { 'golang/a.yml': '3' })

    const history = await sourceCommits({ cwd: repo.dir, anchor, paths: [ 'golang/a.yml' ] })

    assert.equal(history.status, 'ok')
    assert.equal(history.from, anchor)
    assert.equal(history.to, third)
    assert.deepEqual(history.commits, [
        { sha: first, subject: 'feat(golang)[PE-117]: change a' },
        { sha: third, subject: 'fix(golang)[PE-118]: change a again' }
    ])
})

test('skips merge commits', async () => {
    const repo = await sourceRepo()
    const anchor = await repo.commit('initial', { 'a.yml': '1' })
    git(repo.dir, 'checkout', '-q', '-b', 'feature')
    const change = await repo.commit('feat[PE-1]: change a', { 'a.yml': '2' })
    git(repo.dir, 'checkout', '-q', 'main')
    git(repo.dir, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #1 from webitel/feature', 'feature')

    const history = await sourceCommits({ cwd: repo.dir, anchor, paths: [ 'a.yml' ] })

    assert.deepEqual(history.commits.map((c) => c.sha), [ change ])
})

test('reports no-anchor when there is no previous sync', async () => {
    const repo = await sourceRepo()
    await repo.commit('initial', { 'a.yml': '1' })

    const history = await sourceCommits({ cwd: repo.dir, anchor: undefined, paths: [ 'a.yml' ] })

    assert.equal(history.status, 'no-anchor')
    assert.deepEqual(history.commits, [])
})

test('reports unknown-anchor when the anchor is not in the source history', async () => {
    const repo = await sourceRepo()
    await repo.commit('initial', { 'a.yml': '1' })

    const history = await sourceCommits({ cwd: repo.dir, anchor: 'f'.repeat(40), paths: [ 'a.yml' ] })

    assert.equal(history.status, 'unknown-anchor')
    assert.deepEqual(history.commits, [])
})

test('reports shallow when the source checkout has no history', async () => {
    const repo = await sourceRepo()
    const anchor = await repo.commit('initial', { 'a.yml': '1' })
    await repo.commit('second', { 'a.yml': '2' })
    const shallow = await fs.mkdtemp(path.join(os.tmpdir(), 'file-sync-shallow-'))
    git(shallow, 'clone', '-q', '--depth', '1', `file://${ repo.dir }`, '.')

    const history = await sourceCommits({ cwd: shallow, anchor, paths: [ 'a.yml' ] })

    assert.equal(history.status, 'shallow')
})

test('returns no commits when no paths are given', async () => {
    const repo = await sourceRepo()
    const anchor = await repo.commit('initial', { 'a.yml': '1' })
    await repo.commit('second', { 'a.yml': '2' })

    const history = await sourceCommits({ cwd: repo.dir, anchor, paths: [] })

    assert.deepEqual(history.commits, [])
})

test('jiraKeys extracts bracketed keys in order of appearance without duplicates', () => {
    assert.deepEqual(jiraKeys([
        'feat(golang)[PE-117]: take version metadata',
        'fix(golang)[PE-118, WTEL-9675]: use SHA-256 and UTF-8',
        'chore[PE-117]: again',
        'Update libs.update.yml'
    ]), [ 'PE-117', 'PE-118', 'WTEL-9675' ])
})
