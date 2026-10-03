import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'

import { copy, prefixed } from '../src/helpers.js'

async function tmpDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'file-sync-test-'))
}

test('deleteOrphaned removes orphans whose names start with ".git" and keeps the .git directory', async () => {
    const root = await tmpDir()
    const src = path.join(root, 'src') + '/'
    const dest = path.join(root, 'dest') + '/'
    await fs.outputFile(path.join(src, 'kept.txt'), 'source')
    await fs.outputFile(path.join(dest, '.git/config'), 'repo metadata')
    await fs.outputFile(path.join(dest, '.gitkeep'), '')
    await fs.outputFile(path.join(dest, 'orphan.txt'), 'stale')

    await copy(src, dest, true, { deleteOrphaned: true })

    assert.equal(await fs.pathExists(path.join(dest, 'kept.txt')), true)
    assert.equal(await fs.pathExists(path.join(dest, '.git/config')), true)
    assert.equal(await fs.pathExists(path.join(dest, '.gitkeep')), false)
    assert.equal(await fs.pathExists(path.join(dest, 'orphan.txt')), false)
})

test('prefixed joins prefix and text with a space', () => {
    assert.equal(prefixed('🔄', 'synced file(s)'), '🔄 synced file(s)')
})

test('prefixed returns the text unchanged when the prefix is empty', () => {
    assert.equal(prefixed('', 'synced file(s)'), 'synced file(s)')
})
