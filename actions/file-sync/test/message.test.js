import { test } from 'node:test'
import assert from 'node:assert/strict'

import { syncSubject, commitMessage, pullRequestBody, parseState, journalComment, closedComment } from '../src/message.js'

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

test('pull request body carries a state marker that parseState reads back', () => {
    const body = pullRequestBody({ ...base, history: two, stream: 'golang-sync' })

    assert.match(body, /\n<!-- file-sync:state \{.*\} -->$/)
    assert.deepEqual(parseState(body), { stream: 'golang-sync', sourceSha: TO, commits: [ '56c90e3000', '48bb00e000' ] })
})

test('parseState returns undefined for a body without a marker', () => {
    assert.equal(parseState('synced local file(s)'), undefined)
    assert.equal(parseState(null), undefined)
})

test('journal comment lists the source commits added since the previous update', () => {
    const previous = { stream: 'golang-sync', sourceSha: FROM, commits: [ '56c90e3000' ] }

    assert.equal(journalComment({ ...base, history: two }, previous), [
        'Updated by run [#42](https://github.com/webitel/reusable-configs/actions/runs/42): source `9f8e7d6` → `1a2b3c4`.',
        '',
        'New source commits:',
        '- [`48bb00e`](https://github.com/webitel/reusable-configs/commit/48bb00e000) feat(golang)[PE-118]!: sync workflows'
    ].join('\n'))
})

test('journal comment without new source commits says the PR was rebuilt', () => {
    const previous = { stream: 'golang-sync', sourceSha: TO, commits: [ '56c90e3000', '48bb00e000' ] }

    assert.equal(journalComment({ ...base, history: two }, previous),
        'Updated by run [#42](https://github.com/webitel/reusable-configs/actions/runs/42): rebuilt on the current base branch, no new source commits.')
})

test('closed comment names the source commit the target already matches', () => {
    assert.equal(closedComment({ ...base, history: none }),
        'Closed by run [#42](https://github.com/webitel/reusable-configs/actions/runs/42): the target already matches [webitel/reusable-configs@1a2b3c4](https://github.com/webitel/reusable-configs/tree/1a2b3c4000000000000000000000000000000000), nothing left to sync.')
})

const drift = [ { dest: '.github/workflows/pull-request.yml', deleted: false }, { dest: 'old.yml', deleted: true } ]

test('pull request body lists local changes the sync overwrites', () => {
    const body = pullRequestBody({ ...base, history: one, drift })

    assert.match(body, /\n### ⚠️ Local changes overwritten\nThese files were changed in this repository after the last sync; this pull request restores them:\n- `\.github\/workflows\/pull-request\.yml`\n- `old\.yml` \(deleted\)\n/)
})

test('commit message lists overwritten local changes before the trailers', () => {
    const message = commitMessage({ ...base, history: one, drift })

    assert.match(message, /\n\nOverwritten local changes:\n- \.github\/workflows\/pull-request\.yml\n- old\.yml \(deleted\)\n\nSynced-From: /)
})

test('messages have no drift section without drift', () => {
    assert.doesNotMatch(pullRequestBody({ ...base, history: one, drift: [] }), /Local changes overwritten/)
    assert.doesNotMatch(commitMessage({ ...base, history: one }), /Overwritten local changes/)
})

const removed = [ { status: 'D', dest: 'old.yml', source: 'golang/old.yml' } ]

test('commit message names the former source of a deleted file', () => {
    assert.match(commitMessage({ ...base, files: removed, history: one }), /\nFiles:\n- D old\.yml \(was golang\/old\.yml\)\n/)
})

test('pull request body does not link the former source of a deleted file', () => {
    assert.match(pullRequestBody({ ...base, files: removed, history: one }), /\| D \| `old\.yml` \| `golang\/old\.yml` \(removed\) \|/)
})
