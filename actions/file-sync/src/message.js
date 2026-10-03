import { jiraKeys } from './history.js'

const ACTION_URL = 'https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync'

const short = (sha) => sha.slice(0, 7)

// "feat(golang)[PE-117]!: take version metadata" -> "take version metadata"
const description = (subject) => subject.replace(/^\w+(\([^)]*\))?(\[[^\]]*\])?!?:\s*/, '')

const knownRange = (history) => history.status === 'ok' && history.from !== undefined

const runLink = (runUrl) => `[#${ runUrl.split('/').pop() }](${ runUrl })`

const commitLink = (repoUrl, commit) => `- [\`${ short(commit.sha) }\`](${ repoUrl }/commit/${ commit.sha }) ${ commit.subject }`

const STATE_MARKER = /<!-- file-sync:state (\{.*\}) -->/

/**
 * All builders take the same context:
 *   titlePrefix  - e.g. chore(sync)
 *   serverUrl    - e.g. https://github.com
 *   repository   - source repository, owner/name
 *   config       - sync config path in the source repository
 *   runUrl       - URL of the workflow run
 *   history      - result of sourceCommits()
 *   files        - changed files, [{ status: A|M|D, dest, source }]
 *   stream       - sync stream name, stored in the pull request state marker
 */
export function syncSubject({ titlePrefix, repository, history }) {
    const keys = jiraKeys(history.commits.map((c) => c.subject))
    const header = `${ titlePrefix }${ keys.length > 0 ? `[${ keys.join(',') }]` : '' }`

    let text = `sync files from ${ repository }@${ short(history.to) }`
    if (history.commits.length === 1) text = description(history.commits[0].subject)
    if (history.commits.length > 1) text = `${ history.commits.length } changes from ${ repository }`

    return header ? `${ header }: ${ text }` : text
}

export function commitMessage(context) {
    const { repository, config, runUrl, history, files } = context
    const source = knownRange(history)
        ? `${ repository } ${ short(history.from) }..${ short(history.to) }`
        : `${ repository }@${ short(history.to) }`

    const sections = [ syncSubject(context), `Source: ${ source } (${ config })` ]
    if (history.commits.length > 0) {
        sections.push([ 'Changes:', ...history.commits.map((c) => `- ${ c.subject } (${ short(c.sha) })`) ].join('\n'))
    }
    sections.push([ 'Files:', ...files.map((f) => `- ${ f.status } ${ f.dest }${ f.source ? ` <- ${ f.source }` : '' }`) ].join('\n'))
    sections.push([
        `Synced-From: ${ repository }@${ history.to }`,
        `Sync-Config: ${ config }`,
        `Sync-Run: ${ runUrl }`
    ].join('\n'))

    return sections.join('\n\n')
}

export function pullRequestBody(context) {
    const { serverUrl, repository, config, runUrl, history, files, extra } = context
    const repoUrl = `${ serverUrl }/${ repository }`

    const sections = [ `Syncs files from [${ repository }@${ short(history.to) }](${ repoUrl }/tree/${ history.to }) using \`${ config }\`.` ]

    if (knownRange(history) && history.commits.length > 0) {
        sections.push([
            `### Source changes ([${ short(history.from) }..${ short(history.to) }](${ repoUrl }/compare/${ history.from }...${ history.to }))`,
            ...history.commits.map((c) => commitLink(repoUrl, c))
        ].join('\n'))
    }

    sections.push([
        '### Files',
        '| | File | Source |',
        '|---|---|---|',
        ...files.map((f) => `| ${ f.status } | \`${ f.dest }\` | ${ f.source ? `[\`${ f.source }\`](${ repoUrl }/blob/${ history.to }/${ f.source }) ` : '' }|`)
    ].join('\n'))

    if (extra) sections.push(extra)

    // The state marker lets the next run tell which source commits this pull request already contains
    const state = { stream: context.stream, sourceSha: history.to, commits: history.commits.map((c) => c.sha) }
    sections.push([
        '---',
        `Created by [file-sync](${ ACTION_URL }), run ${ runLink(runUrl) }.`,
        'This branch is rebuilt on every sync — do not push to it.',
        `<!-- file-sync:state ${ JSON.stringify(state) } -->`
    ].join('\n'))

    return sections.join('\n\n')
}

export function parseState(body) {
    const match = body?.match(STATE_MARKER)
    return match ? JSON.parse(match[1]) : undefined
}

// Comment posted when an open sync pull request is rebuilt; previous is the state of the replaced content
export function journalComment({ serverUrl, repository, runUrl, history }, previous) {
    const known = new Set(previous?.commits || [])
    const added = history.commits.filter((c) => !known.has(c.sha))

    if (added.length === 0) return `Updated by run ${ runLink(runUrl) }: rebuilt on the current base branch, no new source commits.`

    const range = previous?.sourceSha ? `source \`${ short(previous.sourceSha) }\` → \`${ short(history.to) }\`` : `source \`${ short(history.to) }\``
    return [
        `Updated by run ${ runLink(runUrl) }: ${ range }.`,
        '',
        'New source commits:',
        ...added.map((c) => commitLink(`${ serverUrl }/${ repository }`, c))
    ].join('\n')
}

export function closedComment({ serverUrl, repository, runUrl, history }) {
    return `Closed by run ${ runLink(runUrl) }: the target already matches [${ repository }@${ short(history.to) }](${ serverUrl }/${ repository }/tree/${ history.to }), nothing left to sync.`
}

export const FOREIGN_COMMITS_MARKER = '<!-- file-sync:foreign-commits -->'

export function foreignCommitsComment({ runUrl }, commits) {
    return [
        `Sync skipped by run ${ runLink(runUrl) }: this branch has commits that file-sync did not create, and rebuilding it would drop them:`,
        '',
        ...commits.map((c) => `- \`${ short(c.sha) }\` ${ c.commit.message.split('\n')[0] }`),
        '',
        'Move these changes to the source repository (or merge this pull request), then the next sync updates the branch again.',
        FOREIGN_COMMITS_MARKER
    ].join('\n')
}
