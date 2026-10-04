import { test } from 'node:test'
import assert from 'node:assert/strict'

import { publishStatus, STATUS_ISSUE_MARKER, streamMarker } from '../src/status.js'

const statusIssue = (number, extra = {}) => ({ number, node_id: `I_${ number }`, state: 'open', body: `intro\n${ STATUS_ISSUE_MARKER }`, ...extra })

// Minimal octokit: issues are listed newest first, like the REST API does by default.
function fakeOctokit({ issues = [], search = [], failComment = false, onCreate } = {}) {
    const state = { issues: [ ...issues ], comments: [], created: [], closed: [] }
    const open = () => state.issues.filter((i) => i.state === 'open').sort((a, b) => b.number - a.number)
    const rest = {
        issues: {
            listForRepo: async () => ({ data: open() }),
            create: async ({ title, body }) => {
                const issue = statusIssue(100 + state.created.length, { title, body })
                state.issues.push(issue)
                state.created.push(issue.number)
                onCreate?.(state)
                return { data: issue }
            },
            update: async ({ issue_number: number, state: newState }) => {
                const issue = state.issues.find((i) => i.number === number)
                issue.state = newState
                state.closed.push(number)
                return { data: issue }
            },
            listComments: async ({ issue_number: number }) => ({ data: state.comments.filter((c) => c.number === number) }),
            createComment: async ({ issue_number: number, body }) => {
                if (failComment) throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 })
                state.comments.push({ id: state.comments.length + 1, number, body })
                return { data: {} }
            },
            updateComment: async ({ comment_id: id, body }) => {
                Object.assign(state.comments.find((c) => c.id === id), { body })
                return { data: {} }
            }
        },
        search: { issuesAndPullRequests: async () => ({ data: { items: search } }) }
    }
    return { state, rest, graphql: async () => ({}), paginate: async (fn, params) => (await fn(params)).data }
}

const publish = (octokit) => publishStatus({ octokit, owner: 'webitel', repo: 'reusable-configs', title: 'File sync status', stream: 'golang-sync', comment: `table\n${ streamMarker('golang-sync') }` })

test('comments on the oldest open status issue when there are several', async () => {
    const octokit = fakeOctokit({ issues: [ statusIssue(33), statusIssue(36), { number: 40, state: 'open', pull_request: {}, body: STATUS_ISSUE_MARKER } ] })

    const issue = await publish(octokit)

    assert.equal(issue.number, 33)
    assert.deepEqual(octokit.state.comments.map((c) => c.number), [ 33 ])
    assert.deepEqual(octokit.state.created, [])
})

test('finds the status issue through search when the issue list misses it', async () => {
    const octokit = fakeOctokit({ search: [ statusIssue(33) ] })

    const issue = await publish(octokit)

    assert.equal(issue.number, 33)
    assert.deepEqual(octokit.state.created, [])
})

test('closes its own issue when a concurrent run created an older one', async () => {
    const octokit = fakeOctokit({ onCreate: (state) => state.issues.push(statusIssue(50)) })

    const issue = await publish(octokit)

    assert.equal(issue.number, 50)
    assert.deepEqual(octokit.state.closed, [ 100 ])
    assert.deepEqual(octokit.state.comments.map((c) => c.number), [ 50 ])
})

test('closes the issue it created when it cannot comment, and explains the missing permission', async () => {
    const octokit = fakeOctokit({ failComment: true })

    await assert.rejects(publish(octokit), /needs the Issues: write permission on webitel\/reusable-configs/)
    assert.deepEqual(octokit.state.closed, [ 100 ])
})
