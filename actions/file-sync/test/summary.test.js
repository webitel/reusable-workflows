import { test } from 'node:test'
import assert from 'node:assert/strict'

import { summaryMarkdown } from '../src/summary.js'

test('summaryMarkdown renders one row per repository', () => {
    const markdown = summaryMarkdown('golang-sync', [
        { repository: 'webitel/cases', status: 'up-to-date', drift: 0 },
        { repository: 'webitel/engine', status: 'updated', pullRequest: 'https://github.com/webitel/engine/pull/12', drift: 1 },
        { repository: 'webitel/storage', status: 'failed', error: 'a.yml was changed | twice', drift: 0 }
    ])

    assert.equal(markdown, [
        '### file-sync: golang-sync',
        '',
        '| Repository | Result | Pull request | Drift |',
        '|---|---|---|---|',
        '| webitel/cases | ✅ up to date |  |  |',
        '| webitel/engine | 🔄 updated | [#12](https://github.com/webitel/engine/pull/12) | 1 |',
        '| webitel/storage | ❌ failed: a.yml was changed \\| twice |  |  |',
        ''
    ].join('\n'))
})
