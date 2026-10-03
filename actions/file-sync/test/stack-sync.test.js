import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandbox } from './support/harness.js'

const CONFIG = `
defaults:
  version: v2
files:
  - source: golang/workflow.yml.njk
    dest: .github/workflows/workflow.yml
  - source: golang/.gitignore
    dest: .gitignore
  - source: common/debian/
    dest: deploy/debian/
    when: deb
repos:
  webitel/cases:
    name: cases
    deb: true
  webitel/cli:
    name: cli
`

test('syncs a stack config: shared files, rendered per repository, limited by when', async () => {
    const sandbox = await createSandbox()
    await sandbox.createTarget('webitel/cases')
    await sandbox.createTarget('webitel/cli')
    await sandbox.commitSource('initial', {
        '.github/sync.yml': CONFIG,
        'golang/workflow.yml.njk': 'name: {{ name }}\nuses: workflow@{{ version }}\n',
        'golang/.gitignore': 'bin/\n',
        'common/debian/postinst.sh': '#!/bin/sh\n'
    })

    const result = await sandbox.runAction({ inputs: { SKIP_PR: true } })

    assert.equal(result.failed, false, result.output)
    assert.equal(sandbox.readTarget('webitel/cases', 'main', '.github/workflows/workflow.yml'), 'name: cases\nuses: workflow@v2')
    assert.equal(sandbox.readTarget('webitel/cli', 'main', '.github/workflows/workflow.yml'), 'name: cli\nuses: workflow@v2')
    assert.equal(sandbox.readTarget('webitel/cases', 'main', '.gitignore'), 'bin/')
    assert.equal(sandbox.readTarget('webitel/cases', 'main', 'deploy/debian/postinst.sh'), '#!/bin/sh')
    assert.equal(sandbox.readTarget('webitel/cli', 'main', 'deploy/debian/postinst.sh'), undefined)
})
