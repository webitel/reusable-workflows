export const LABELS = {
    'created': '🆕 created',
    'updated': '🔄 updated',
    'unchanged': '⏸️ unchanged',
    'up-to-date': '✅ up to date',
    'closed': '✖️ closed',
    'skipped': '⚠️ skipped',
    'pushed': '⬆️ pushed',
    'dry-run': '🧪 dry run',
    'failed': '❌ failed'
}

export const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')

/**
 * Markdown table of the sync results of one run.
 * results: [{ repository, status, pullRequest?, drift, error? }]
 */
export function summaryMarkdown(stream, results) {
    const rows = results.map((r) => {
        const result = r.error ? `${ LABELS[r.status] }: ${ cell(r.error) }` : LABELS[r.status] || r.status
        const pr = r.pullRequest ? `[#${ r.pullRequest.split('/').pop() }](${ r.pullRequest })` : ''
        return `| ${ r.repository } | ${ result } | ${ pr } | ${ r.drift || '' } |`
    })

    return [
        `### file-sync: ${ stream }`,
        '',
        '| Repository | Result | Pull request | Drift |',
        '|---|---|---|---|',
        ...rows,
        ''
    ].join('\n')
}
