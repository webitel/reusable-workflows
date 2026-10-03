import * as core from '@actions/core'

import { LABELS, cell } from './summary.js'

export const STATUS_ISSUE_MARKER = '<!-- file-sync:status -->'

export const streamMarker = (stream) => `<!-- file-sync:status stream=${ stream } -->`

// A sync pull request open longer than this is listed as needing attention
const STALE_DAYS = 7

const short = (sha) => sha.slice(0, 7)
const day = (iso) => iso.slice(0, 10)
const prLink = (r) => `[#${ r.pullRequestNumber }](${ r.pullRequest })`

function attention(result, now) {
    const { repository: repo } = result
    if (result.status === 'failed') return `❌ ${ repo }: ${ cell(result.error) }`
    if (result.status === 'skipped') return `⛔ ${ repo }: ${ prLink(result) } has commits file-sync did not create`
    if (result.drift > 0) {
        const where = result.pullRequest ? ` in ${ prLink(result) }` : ''
        return `⚠️ ${ repo }: ${ result.drift } local change${ result.drift > 1 ? 's' : '' } overwritten${ where }`
    }
    if (result.pullRequestCreatedAt && now - new Date(result.pullRequestCreatedAt) > STALE_DAYS * 24 * 3600 * 1000) {
        return `🕒 ${ repo }: ${ prLink(result) } open since ${ day(result.pullRequestCreatedAt) }`
    }
    return undefined
}

/**
 * Section of one sync stream in the status issue.
 * context: { stream, config, serverUrl, repository (source), runUrl, sourceSha, now }
 * results: entries of the results output, with syncedSha / syncedAt and pull request number and creation time
 */
export function statusComment(context, results) {
    const { stream, config, serverUrl, repository, runUrl, sourceSha, now } = context
    const repoUrl = `${ serverUrl }/${ repository }`
    const time = now.toISOString().replace('T', ' ').slice(0, 16)

    const lines = [
        `### ${ stream } · \`${ config }\``,
        `Updated by run [#${ runUrl.split('/').pop() }](${ runUrl }) at ${ time } UTC from [\`${ short(sourceSha) }\`](${ repoUrl }/tree/${ sourceSha }).`,
        ''
    ]

    // Failures last: they usually need a look at the run rather than at a pull request
    const items = [ ...results.filter((r) => r.status !== 'failed'), ...results.filter((r) => r.status === 'failed') ]
        .map((r) => attention(r, now))
        .filter(Boolean)
    if (items.length > 0) lines.push('**Needs attention**', ...items.map((item) => `- ${ item }`), '')

    lines.push('| Repository | Synced to | Pull request | Result |', '|---|---|---|---|')
    for (const r of results) {
        const synced = r.syncedSha ? `[\`${ short(r.syncedSha) }\`](${ repoUrl }/commit/${ r.syncedSha })${ r.syncedAt ? ` · ${ r.syncedAt }` : '' }` : '—'
        const pr = r.pullRequest ? `${ prLink(r) } · since ${ day(r.pullRequestCreatedAt) }` : ''
        lines.push(`| ${ r.repository } | ${ synced } | ${ pr } | ${ LABELS[r.status] || r.status } |`)
    }

    lines.push('', streamMarker(stream))
    return lines.join('\n')
}

function issueBody(repository) {
    return [
        `Status of the files synced from ${ repository } by [file-sync](https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync).`,
        '',
        'Every sync stream keeps its own comment below up to date on each run.',
        '',
        `Results: ${ Object.values(LABELS).join(' · ') }`,
        '',
        STATUS_ISSUE_MARKER
    ].join('\n')
}

/**
 * Creates or updates the comment of this stream in the status issue of the source repository.
 * The issue is found by its marker; when missing it is created (and pinned when the token may do so).
 */
export async function publishStatus({ octokit, owner, repo, title, stream, comment }) {
    const issues = await octokit.paginate(octokit.rest.issues.listForRepo, { owner, repo, state: 'open', per_page: 100 })
    let issue = issues.find((i) => !i.pull_request && i.body?.includes(STATUS_ISSUE_MARKER))

    if (!issue) {
        core.info(`Creating status issue "${ title }"`)
        issue = (await octokit.rest.issues.create({ owner, repo, title, body: issueBody(`${ owner }/${ repo }`) })).data
        try {
            await octokit.graphql('mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { id } } }', { id: issue.node_id })
        } catch (err) {
            core.warning(`Could not pin status issue #${ issue.number }, pin it manually: ${ err.message }`)
        }
    }

    const comments = await octokit.paginate(octokit.rest.issues.listComments, { owner, repo, issue_number: issue.number, per_page: 100 })
    const existing = comments.find((c) => c.body?.includes(streamMarker(stream)))
    if (existing) {
        await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body: comment })
    } else {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: comment })
    }

    return issue
}
