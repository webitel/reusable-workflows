import { execFileSync, spawn } from 'child_process'
import fs from 'fs-extra'
import * as http from 'http'
import * as os from 'os'
import * as path from 'path'

const ACTION_ENTRY = new URL('../../src/index.js', import.meta.url).pathname

// Isolates git from the developer's global config (signing, hooks, default branch).
export const GIT_ENV = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com'
}

export function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, env: { PATH: process.env.PATH, ...GIT_ENV }, encoding: 'utf8' }).trim()
}

async function writeFiles(dir, files) {
    for (const [ file, content ] of Object.entries(files)) {
        await fs.outputFile(path.join(dir, file), content)
    }
}

// A sandbox holds the source repository (where the action runs) and bare "remote" target repositories.
export async function createSandbox() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-sync-it-'))
    const remotes = path.join(root, 'remotes')
    const source = path.join(root, 'source')
    await fs.ensureDir(source)
    git(source, 'init', '-q', '-b', 'main')

    return {
        root,
        source,

        // Commits files to the source repository and returns the commit SHA.
        async commitSource(message, files) {
            await writeFiles(source, files)
            git(source, 'add', '-A')
            git(source, 'commit', '-q', '-m', message)
            return git(source, 'rev-parse', 'HEAD')
        },

        // Replaces the source repository with a depth-1 clone of itself.
        async makeSourceShallow() {
            const full = path.join(root, 'source-full')
            await fs.move(source, full)
            git(root, 'clone', '-q', '--depth', '1', `file://${ full }`, source)
        },

        // Creates a bare target repository owner/name with one commit on main.
        async createTarget(fullName, files = { 'README.md': 'target\n' }) {
            const bare = path.join(remotes, `${ fullName }.git`)
            const work = path.join(root, 'work', fullName)
            await fs.ensureDir(bare)
            git(bare, 'init', '-q', '--bare', '-b', 'main')
            await fs.ensureDir(work)
            git(work, 'init', '-q', '-b', 'main')
            await writeFiles(work, files)
            git(work, 'add', '-A')
            git(work, 'commit', '-q', '-m', 'initial')
            git(work, 'push', '-q', bare, 'main')
            return bare
        },

        // Commits files directly to a target branch, as a developer would.
        async commitTarget(fullName, branch, message, files) {
            const work = path.join(root, 'work', fullName)
            git(work, 'fetch', '-q', path.join(remotes, `${ fullName }.git`), branch)
            git(work, 'checkout', '-q', '-B', branch, 'FETCH_HEAD')
            await writeFiles(work, files)
            git(work, 'add', '-A')
            git(work, 'commit', '-q', '-m', message)
            git(work, 'push', '-q', '-f', path.join(remotes, `${ fullName }.git`), branch)
        },

        readTarget(fullName, ref, file) {
            try {
                return git(path.join(remotes, `${ fullName }.git`), 'show', `${ ref }:${ file }`)
            } catch {
                return undefined
            }
        },

        targetLog(fullName, ref, format = '%B') {
            return git(path.join(remotes, `${ fullName }.git`), 'log', `--format=${ format }`, ref)
        },

        targetHasBranch(fullName, branch) {
            return git(path.join(remotes, `${ fullName }.git`), 'branch', '--list', branch) !== ''
        },

        // Starts a fake GitHub API that reads pull request commits from this sandbox's target repositories.
        startApi() {
            return startFakeGitHub({ remotes })
        },

        branchHead(fullName, branch) {
            return git(path.join(remotes, `${ fullName }.git`), 'rev-parse', branch)
        },

        // Runs the action in the source repository; inputs are action input names (e.g. SKIP_PR).
        runAction({ inputs = {}, env = {}, api } = {}) {
            const inputEnv = Object.fromEntries(Object.entries(inputs).map(([ key, value ]) => [ `INPUT_${ key }`, String(value) ]))
            const fullEnv = {
                PATH: process.env.PATH,
                ...GIT_ENV,
                // Route https://token@github.com/<owner>/<repo>.git to the bare repositories.
                GIT_CONFIG_COUNT: '1',
                GIT_CONFIG_KEY_0: `url.file://${ remotes }/.insteadOf`,
                GIT_CONFIG_VALUE_0: 'https://token@github.com/',
                GITHUB_REPOSITORY: 'webitel/source',
                GITHUB_SERVER_URL: 'https://github.com',
                GITHUB_RUN_ID: '42',
                GITHUB_API_URL: api ? api.url : 'http://127.0.0.1:9',
                INPUT_GH_PAT: 'token',
                INPUT_GIT_EMAIL: 'bot@example.com',
                INPUT_GIT_USERNAME: 'sync-bot',
                ...inputEnv,
                ...env
            }

            return new Promise((resolve) => {
                const child = spawn(process.execPath, [ ACTION_ENTRY ], { cwd: source, env: fullEnv })
                let output = ''
                child.stdout.on('data', (chunk) => { output += chunk })
                child.stderr.on('data', (chunk) => { output += chunk })
                child.on('close', (code) => {
                    const failed = /^::error::/m.test(output)
                    resolve({ code, output, failed })
                })
            })
        }
    }
}

// Minimal in-memory GitHub REST API for the endpoints the action uses.
export async function startFakeGitHub({ remotes } = {}) {
    const state = { pulls: [], comments: [], requests: [] }

    const send = (res, status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
    }

    const server = http.createServer(async (req, res) => {
        try {
            await handle(req, res)
        } catch (err) {
            send(res, 500, { message: `fake GitHub: ${ err.message }` })
        }
    })

    const handle = async (req, res) => {
        let raw = ''
        for await (const chunk of req) raw += chunk
        const body = raw ? JSON.parse(raw) : {}
        const url = new URL(req.url, 'http://localhost')
        state.requests.push({ method: req.method, path: url.pathname, body })

        let m
        if ((m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls$/))) {
            const repo = `${ m[1] }/${ m[2] }`
            if (req.method === 'GET') {
                const head = url.searchParams.get('head')
                return send(res, 200, state.pulls.filter((p) => p.repo === repo && p.state === 'open' && `${ m[1] }:${ p.head.ref }` === head))
            }
            const pr = {
                repo,
                number: state.pulls.length + 1,
                state: 'open',
                title: body.title,
                body: body.body,
                head: { ref: body.head.split(':')[1] },
                base: { ref: body.base },
                user: { login: 'sync-bot' },
                labels: [],
                html_url: `https://github.com/${ repo }/pull/${ state.pulls.length + 1 }`
            }
            state.pulls.push(pr)
            return send(res, 201, pr)
        }

        if ((m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/commits$/))) {
            const pr = state.pulls.find((p) => p.repo === `${ m[1] }/${ m[2] }` && p.number === Number(m[3]))
            const log = git(path.join(remotes, `${ pr.repo }.git`), 'log', '--reverse', '--format=%H%x1f%ae%x1f%B%x1e', `${ pr.base.ref }..${ pr.head.ref }`)
            const commits = log.split('\x1e').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
                const [ sha, email, message ] = entry.split('\x1f')
                return { sha, commit: { message: message.trim(), author: { email } }, author: null }
            })
            return send(res, 200, commits)
        }

        if ((m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/))) {
            const pr = state.pulls.find((p) => p.repo === `${ m[1] }/${ m[2] }` && p.number === Number(m[3]))
            if (req.method === 'PATCH') Object.assign(pr, body)
            return send(res, 200, pr)
        }

        if ((m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/))) {
            const comment = { repo: `${ m[1] }/${ m[2] }`, number: Number(m[3]), body: body.body }
            if (req.method === 'GET') return send(res, 200, state.comments.filter((c) => c.repo === comment.repo && c.number === comment.number))
            state.comments.push(comment)
            return send(res, 201, comment)
        }

        if ((m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/labels$/))) {
            const pr = state.pulls.find((p) => p.repo === `${ m[1] }/${ m[2] }` && p.number === Number(m[3]))
            pr.labels.push(...body.labels.map((name) => ({ name })))
            return send(res, 200, pr.labels)
        }

        send(res, 404, { message: `fake GitHub: ${ req.method } ${ url.pathname } not implemented` })
    }

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

    return {
        url: `http://127.0.0.1:${ server.address().port }`,
        state,
        close: () => new Promise((resolve) => server.close(resolve))
    }
}
