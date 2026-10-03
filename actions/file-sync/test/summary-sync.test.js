import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import * as path from 'path'

import { createSandbox } from './support/harness.js'

const CONFIG = `
webitel/target:
  - source: golang/a.yml
    dest: a.yml
webitel/missing:
  - source: golang/a.yml
    dest: a.yml
`

test('writes a job summary and a results output for every repository', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/target')
    await sandbox.commitSource('initial', { '.github/sync.yml': CONFIG, 'golang/a.yml': '1\n' })
    const summary = path.join(sandbox.root, 'summary.md')
    const output = path.join(sandbox.root, 'output.txt')
    await fs.outputFile(summary, '')
    await fs.outputFile(output, '')

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true }, env: { GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output } })

    assert.equal(result.failed, true)
    const markdown = await fs.readFile(summary, 'utf8')
    assert.match(markdown, /### file-sync: sync\n/)
    assert.match(markdown, /\| webitel\/target \| ⬆️ pushed \|/)
    assert.match(markdown, /\| webitel\/missing \| ❌ failed: /)

    const outputs = await fs.readFile(output, 'utf8')
    const json = outputs.match(/^results<<(.+)\n([\s\S]*?)\n\1$/m)[2]
    assert.deepEqual(JSON.parse(json).map((r) => [ r.repository, r.status ]), [ [ 'webitel/target', 'pushed' ], [ 'webitel/missing', 'failed' ] ])
})
