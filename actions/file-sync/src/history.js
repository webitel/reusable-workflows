import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function git(cwd, ...args) {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 * 4 })
    return stdout.trim()
}

async function succeeds(cwd, ...args) {
    try {
        await git(cwd, ...args)
        return true
    } catch {
        return false
    }
}

/**
 * Lists the source commits between the last synced commit (anchor) and HEAD that touched paths.
 *
 * status is 'ok', or explains why the range is unknown:
 *   no-anchor      — nothing was synced before
 *   shallow        — the anchor is missing because the checkout has no full history
 *   unknown-anchor — the anchor is not an ancestor of HEAD (e.g. rewritten history)
 */
export async function sourceCommits({ cwd, anchor, paths }) {
    const to = await git(cwd, 'rev-parse', 'HEAD')
    const result = (status, commits = []) => ({ status, from: anchor, to, commits })

    if (!anchor) return result('no-anchor')

    if (!await succeeds(cwd, 'cat-file', '-e', `${ anchor }^{commit}`)) {
        const shallow = await git(cwd, 'rev-parse', '--is-shallow-repository') === 'true'
        return result(shallow ? 'shallow' : 'unknown-anchor')
    }
    if (!await succeeds(cwd, 'merge-base', '--is-ancestor', anchor, to)) return result('unknown-anchor')
    if (paths.length === 0) return result('ok')

    const output = await git(cwd, 'log', '--no-merges', '--reverse', '--format=%H%x1f%s', `${ anchor }..${ to }`, '--', ...paths)
    const commits = output === '' ? [] : output.split('\n').map((line) => {
        const [ sha, subject ] = line.split('\x1f')
        return { sha, subject }
    })

    return result('ok', commits)
}

// Extracts Jira keys written in brackets, as in "feat(golang)[PE-117, PE-118]: ..."
export function jiraKeys(subjects) {
    const keys = []
    for (const subject of subjects) {
        for (const [ , group ] of subject.matchAll(/\[([^\]]+)\]/g)) {
            for (const key of group.split(',').map((k) => k.trim())) {
                if (/^[A-Z][A-Z0-9]+-\d+$/.test(key) && !keys.includes(key)) keys.push(key)
            }
        }
    }
    return keys
}
