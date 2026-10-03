import { jiraKeys } from './history.js'

const ACTION_URL = 'https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync'

const short = (sha) => sha.slice(0, 7)

// "feat(golang)[PE-117]!: take version metadata" -> "take version metadata"
const description = (subject) => subject.replace(/^\w+(\([^)]*\))?(\[[^\]]*\])?!?:\s*/, '')

const knownRange = (history) => history.status === 'ok' && history.from !== undefined

/**
 * All builders take the same context:
 *   titlePrefix  - e.g. chore(sync)
 *   serverUrl    - e.g. https://github.com
 *   repository   - source repository, owner/name
 *   config       - sync config path in the source repository
 *   runUrl       - URL of the workflow run
 *   history      - result of sourceCommits()
 *   files        - changed files, [{ status: A|M|D, dest, source }]
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
            ...history.commits.map((c) => `- [\`${ short(c.sha) }\`](${ repoUrl }/commit/${ c.sha }) ${ c.subject }`)
        ].join('\n'))
    }

    sections.push([
        '### Files',
        '| | File | Source |',
        '|---|---|---|',
        ...files.map((f) => `| ${ f.status } | \`${ f.dest }\` | ${ f.source ? `[\`${ f.source }\`](${ repoUrl }/blob/${ history.to }/${ f.source }) ` : '' }|`)
    ].join('\n'))

    if (extra) sections.push(extra)

    sections.push([
        '---',
        `Created by [file-sync](${ ACTION_URL }), run [#${ runUrl.split('/').pop() }](${ runUrl }).`,
        'This branch is rebuilt on every sync — do not push to it.'
    ].join('\n'))

    return sections.join('\n\n')
}
