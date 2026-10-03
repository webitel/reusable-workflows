import { test } from 'node:test'
import assert from 'node:assert/strict'

import { syncSubject, commitMessage, pullRequestBody } from '../src/message.js'

const FROM = '9f8e7d6000000000000000000000000000000000'
const TO = '1a2b3c4000000000000000000000000000000000'

const base = {
    titlePrefix: 'chore(sync)',
    serverUrl: 'https://github.com',
    repository: 'webitel/reusable-configs',
    config: 'golang/sync.yml',
    runUrl: 'https://github.com/webitel/reusable-configs/actions/runs/42',
    files: [
        { status: 'M', dest: '.github/workflows/pull-request.yml', source: 'golang/workflows/pull-request.yml.njk' },
        { status: 'A', dest: '.github/workflows/release-branch.yml', source: 'common/workflows/release-branch.yml' },
        { status: 'D', dest: 'old.yml', source: undefined }
    ]
}

const one = { status: 'ok', from: FROM, to: TO, commits: [ { sha: '56c90e3000', subject: 'feat(golang)[PE-117]: take version metadata from prepare outputs' } ] }
const two = { status: 'ok', from: FROM, to: TO, commits: [ ...one.commits, { sha: '48bb00e000', subject: 'feat(golang)[PE-118]!: sync workflows' } ] }
const none = { status: 'no-anchor', from: undefined, to: TO, commits: [] }

test('subject of a single source commit reuses its description and Jira keys', () => {
    assert.equal(syncSubject({ ...base, history: one }), 'chore(sync)[PE-117]: take version metadata from prepare outputs')
})

test('subject of several source commits counts them', () => {
    assert.equal(syncSubject({ ...base, history: two }), 'chore(sync)[PE-117,PE-118]: 2 changes from webitel/reusable-configs')
})

test('subject without known source commits names the source commit', () => {
    assert.equal(syncSubject({ ...base, history: none }), 'chore(sync): sync files from webitel/reusable-configs@1a2b3c4')
})

test('subject keeps a commit without a conventional prefix as is', () => {
    const history = { ...one, commits: [ { sha: 'abc', subject: 'Update libs.update.yml' } ] }
    assert.equal(syncSubject({ ...base, history }), 'chore(sync): Update libs.update.yml')
})

test('subject without a title prefix still carries the Jira keys', () => {
    assert.equal(syncSubject({ ...base, titlePrefix: '', history: one }), '[PE-117]: take version metadata from prepare outputs')
    assert.equal(syncSubject({ ...base, titlePrefix: '', history: none }), 'sync files from webitel/reusable-configs@1a2b3c4')
})

test('commit message lists source changes, files and trailers', () => {
    assert.equal(commitMessage({ ...base, history: two }), [
        'chore(sync)[PE-117,PE-118]: 2 changes from webitel/reusable-configs',
        '',
        'Source: webitel/reusable-configs 9f8e7d6..1a2b3c4 (golang/sync.yml)',
        '',
        'Changes:',
        '- feat(golang)[PE-117]: take version metadata from prepare outputs (56c90e3)',
        '- feat(golang)[PE-118]!: sync workflows (48bb00e)',
        '',
        'Files:',
        '- M .github/workflows/pull-request.yml <- golang/workflows/pull-request.yml.njk',
        '- A .github/workflows/release-branch.yml <- common/workflows/release-branch.yml',
        '- D old.yml',
        '',
        `Synced-From: webitel/reusable-configs@${ TO }`,
        'Sync-Config: golang/sync.yml',
        'Sync-Run: https://github.com/webitel/reusable-configs/actions/runs/42'
    ].join('\n'))
})

test('commit message without a known range names the source commit only', () => {
    const message = commitMessage({ ...base, history: none })
    assert.match(message, /\n\nSource: webitel\/reusable-configs@1a2b3c4 \(golang\/sync\.yml\)\n\nFiles:\n/)
    assert.doesNotMatch(message, /Changes:/)
})

test('pull request body links the source commit, changes and files', () => {
    const body = pullRequestBody({ ...base, history: two, extra: 'Custom text' })

    assert.match(body, /^Syncs files from \[webitel\/reusable-configs@1a2b3c4\]\(https:\/\/github\.com\/webitel\/reusable-configs\/tree\/1a2b3c4000000000000000000000000000000000\) using `golang\/sync\.yml`\./)
    assert.match(body, /### Source changes \(\[9f8e7d6\.\.1a2b3c4\]\(https:\/\/github\.com\/webitel\/reusable-configs\/compare\/9f8e7d6000000000000000000000000000000000\.\.\.1a2b3c4000000000000000000000000000000000\)\)/)
    assert.match(body, /- \[`56c90e3`\]\(https:\/\/github\.com\/webitel\/reusable-configs\/commit\/56c90e3000\) feat\(golang\)\[PE-117\]: take version metadata from prepare outputs/)
    assert.match(body, /\| M \| `\.github\/workflows\/pull-request\.yml` \| \[`golang\/workflows\/pull-request\.yml\.njk`\]\(https:\/\/github\.com\/webitel\/reusable-configs\/blob\/1a2b3c4000000000000000000000000000000000\/golang\/workflows\/pull-request\.yml\.njk\) \|/)
    assert.match(body, /\| D \| `old\.yml` \| \|/)
    assert.match(body, /\nCustom text\n/)
    assert.match(body, /Created by \[file-sync\]\(https:\/\/github\.com\/webitel\/reusable-workflows\/tree\/main\/actions\/file-sync\), run \[#42\]\(https:\/\/github\.com\/webitel\/reusable-configs\/actions\/runs\/42\)\./)
})

test('pull request body omits source changes without a known range', () => {
    assert.doesNotMatch(pullRequestBody({ ...base, history: none }), /### Source changes/)
})
