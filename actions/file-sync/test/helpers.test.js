import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'

import { copy } from '../src/helpers.js'

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

test('copy of a directory returns every copied file and skips excluded paths', async () => {
    const root = await tmpDir()
    const src = path.join(root, 'src') + '/'
    const dest = path.join(root, 'dest') + '/'
    await fs.outputFile(path.join(src, 'a.yml'), 'a')
    await fs.outputFile(path.join(src, 'nested/b.yml'), 'b')
    await fs.outputFile(path.join(src, 'skip/c.yml'), 'c')
    await fs.outputFile(path.join(src, 'd.yml'), 'd')

    const written = await copy(src, dest, true, { exclude: [ path.join(src, 'skip/'), path.join(src, 'd.yml') ] })

    assert.deepEqual(written, [
        { source: path.join(src, 'a.yml'), dest: path.join(dest, 'a.yml') },
        { source: path.join(src, 'nested/b.yml'), dest: path.join(dest, 'nested/b.yml') }
    ])
    assert.equal(await fs.pathExists(path.join(dest, 'skip/c.yml')), false)
    assert.equal(await fs.pathExists(path.join(dest, 'd.yml')), false)
})

test('copy of a single file returns it', async () => {
    const root = await tmpDir()
    await fs.outputFile(path.join(root, 'a.yml'), 'a')

    const written = await copy(path.join(root, 'a.yml'), path.join(root, 'out/a.yml'), false, {})

    assert.deepEqual(written, [ { source: path.join(root, 'a.yml'), dest: path.join(root, 'out/a.yml') } ])
    assert.equal(await fs.readFile(path.join(root, 'out/a.yml'), 'utf8'), 'a')
})

test('copy of a template directory skips excluded paths', async () => {
    // nunjucks only loads templates below the working directory, as in the action.
    const root = await tmpDir()
    process.chdir(root)
    const src = 'src/'
    const dest = path.join(root, 'dest') + '/'
    await fs.outputFile(path.join(src, 'a.yml'), 'name: {{ name }}')
    await fs.outputFile(path.join(src, 'skip.yml'), 'skipped')

    const written = await copy(src, dest, true, { template: { name: 'x' }, exclude: [ path.join(src, 'skip.yml') ] })

    assert.deepEqual(written.map((f) => f.dest), [ path.join(dest, 'a.yml') ])
    assert.equal(await fs.readFile(path.join(dest, 'a.yml'), 'utf8'), 'name: x')
    assert.equal(await fs.pathExists(path.join(dest, 'skip.yml')), false)
})

test('copy keeps the executable bit of copied files', async () => {
    const root = await tmpDir()
    const src = path.join(root, 'src') + '/'
    const dest = path.join(root, 'dest') + '/'
    await fs.outputFile(path.join(src, 'postinst.sh'), '#!/bin/sh')
    await fs.chmod(path.join(src, 'postinst.sh'), 0o755)

    await copy(src, dest, true, {})

    assert.equal((await fs.stat(path.join(dest, 'postinst.sh'))).mode & 0o777, 0o755)
})
