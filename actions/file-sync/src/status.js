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

const isStatusIssue = (issue) => !issue.pull_request && issue.state !== 'closed' && Boolean(issue.body?.includes(STATUS_ISSUE_MARKER))

// Open status issues, oldest first. Search covers tokens whose issue list misses them (e.g. a pending permission).
async function findStatusIssues(octokit, owner, repo) {
    const listed = await octokit.paginate(octokit.rest.issues.listForRepo, { owner, repo, state: 'open', per_page: 100 })
    let found = listed.filter(isStatusIssue)

    if (found.length === 0) {
        try {
            const { data } = await octokit.rest.search.issuesAndPullRequests({ q: `repo:${ owner }/${ repo } is:issue is:open in:body "file-sync:status"` })
            found = data.items.filter(isStatusIssue)
        } catch (err) {
            core.debug(`Searching for the status issue failed: ${ err.message }`)
        }
    }

    return found.sort((a, b) => a.number - b.number)
}

async function closeIssue(octokit, owner, repo, number) {
    await octokit.rest.issues.update({ owner, repo, issue_number: number, state: 'closed', state_reason: 'not_planned' })
}

async function upsertComment(octokit, owner, repo, issue, stream, comment) {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, { owner, repo, issue_number: issue.number, per_page: 100 })
    const existing = comments.find((c) => c.body?.includes(streamMarker(stream)))
    if (existing) {
        await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body: comment })
    } else {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: comment })
    }
}

/**
 * Creates or updates the comment of this stream in the status issue of the source repository.
 * The oldest open issue with the marker is used; when there is none it is created (and pinned when the token may).
 * Streams starting together may each create one: every run then keeps the oldest and closes the one it created.
 */
export async function publishStatus({ octokit, owner, repo, title, stream, comment }) {
    let [ issue ] = await findStatusIssues(octokit, owner, repo)
    let created

    if (!issue) {
        core.info(`Creating status issue "${ title }"`)
        created = (await octokit.rest.issues.create({ owner, repo, title, body: issueBody(`${ owner }/${ repo }`) })).data

        const [ oldest ] = await findStatusIssues(octokit, owner, repo)
        if (oldest && oldest.number < created.number) {
            core.info(`Status issue #${ oldest.number } was created concurrently; closing #${ created.number }`)
            await closeIssue(octokit, owner, repo, created.number)
            issue = oldest
        } else {
            issue = created
            try {
                await octokit.graphql('mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { id } } }', { id: issue.node_id })
            } catch (err) {
                core.warning(`Could not pin status issue #${ issue.number }, pin it manually: ${ err.message }`)
            }
        }
    }

    try {
        await upsertComment(octokit, owner, repo, issue, stream, comment)
    } catch (err) {
        // Do not leave an empty issue behind: the next run would not find a usable one either
        if (created && issue.number === created.number) {
            await closeIssue(octokit, owner, repo, created.number).catch(() => undefined)
        }
        if (err.status === 403) {
            throw new Error(`file-sync needs the Issues: write permission on ${ owner }/${ repo } to update the status issue (${ err.message })`)
        }
        throw err
    }

    return issue
}
