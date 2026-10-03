import { test } from 'node:test'
import assert from 'node:assert/strict'

import { statusComment, STATUS_ISSUE_MARKER, streamMarker } from '../src/status.js'

const SHA = '1a2b3c4000000000000000000000000000000000'
const OLD = '4341ec7000000000000000000000000000000000'

const context = {
    stream: 'golang-sync',
    config: 'golang/sync.yml',
    serverUrl: 'https://github.com',
    repository: 'webitel/reusable-configs',
    runUrl: 'https://github.com/webitel/reusable-configs/actions/runs/42',
    sourceSha: SHA,
    now: new Date('2026-10-03T14:20:00Z')
}

const pr = (repo, number, createdAt) => ({
    pullRequest: `https://github.com/${ repo }/pull/${ number }`,
    pullRequestNumber: number,
    pullRequestCreatedAt: createdAt
})

const results = [
    { repository: 'webitel/cases', status: 'skipped', drift: 0, syncedSha: OLD, syncedAt: '2026-10-01', ...pr('webitel/cases', 83, '2026-09-30T10:00:00Z') },
    { repository: 'webitel/engine', status: 'updated', drift: 1, syncedSha: OLD, syncedAt: '2026-10-01', ...pr('webitel/engine', 12, '2026-10-02T10:00:00Z') },
    { repository: 'webitel/logger', status: 'unchanged', drift: 0, syncedSha: OLD, syncedAt: '2026-10-01', ...pr('webitel/logger', 84, '2026-09-20T10:00:00Z') },
    { repository: 'webitel/storage', status: 'failed', drift: 0, error: 'clone | failed' },
    { repository: 'webitel/fts', status: 'up-to-date', drift: 0, syncedSha: SHA, syncedAt: '2026-10-03' }
]

test('statusComment renders attention items and one row per repository', () => {
    assert.equal(statusComment(context, results), [
        '### golang-sync · `golang/sync.yml`',
        'Updated by run [#42](https://github.com/webitel/reusable-configs/actions/runs/42) at 2026-10-03 14:20 UTC from [`1a2b3c4`](https://github.com/webitel/reusable-configs/tree/1a2b3c4000000000000000000000000000000000).',
        '',
        '**Needs attention**',
        '- ⛔ webitel/cases: [#83](https://github.com/webitel/cases/pull/83) has commits file-sync did not create',
        '- ⚠️ webitel/engine: 1 local change overwritten in [#12](https://github.com/webitel/engine/pull/12)',
        '- 🕒 webitel/logger: [#84](https://github.com/webitel/logger/pull/84) open since 2026-09-20',
        '- ❌ webitel/storage: clone \\| failed',
        '',
        '| Repository | Synced to | Pull request | Result |',
        '|---|---|---|---|',
        '| webitel/cases | [`4341ec7`](https://github.com/webitel/reusable-configs/commit/4341ec7000000000000000000000000000000000) · 2026-10-01 | [#83](https://github.com/webitel/cases/pull/83) · since 2026-09-30 | ⚠️ skipped |',
        '| webitel/engine | [`4341ec7`](https://github.com/webitel/reusable-configs/commit/4341ec7000000000000000000000000000000000) · 2026-10-01 | [#12](https://github.com/webitel/engine/pull/12) · since 2026-10-02 | 🔄 updated |',
        '| webitel/logger | [`4341ec7`](https://github.com/webitel/reusable-configs/commit/4341ec7000000000000000000000000000000000) · 2026-10-01 | [#84](https://github.com/webitel/logger/pull/84) · since 2026-09-20 | ⏸️ unchanged |',
        '| webitel/storage | — |  | ❌ failed |',
        '| webitel/fts | [`1a2b3c4`](https://github.com/webitel/reusable-configs/commit/1a2b3c4000000000000000000000000000000000) · 2026-10-03 |  | ✅ up to date |',
        '',
        streamMarker('golang-sync')
    ].join('\n'))
})

test('statusComment has no attention section when everything is fine', () => {
    const comment = statusComment(context, [ results[4] ])
    assert.doesNotMatch(comment, /Needs attention/)
})

test('markers identify the status issue and each stream comment', () => {
    assert.equal(STATUS_ISSUE_MARKER, '<!-- file-sync:status -->')
    assert.equal(streamMarker('golang-sync'), '<!-- file-sync:status stream=golang-sync -->')
})
