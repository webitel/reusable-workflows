import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

import config from './config.js'
import { forEach, addTrailingSlash, pathIsDirectory, copy } from './helpers.js'
import { manifestPath, readManifest, parseManifest, serializeManifest, sameFiles, sha256, findOwnershipConflicts, findDrift } from './manifest.js'
import { sourceCommits } from './history.js'
import { syncSubject, commitMessage, pullRequestBody, parseState, journalComment, closedComment, foreignCommitsComment, FOREIGN_COMMITS_MARKER } from './message.js'

const {
    CONFIG_PATH,
    SYNC_NAME,
    TITLE_PREFIX,
    GITHUB_REPOSITORY,
    GITHUB_SERVER_URL,
    PR_BODY,
    PR_LABELS,
    ASSIGNEES,
    REVIEWERS,
    TEAM_REVIEWERS,
    DRY_RUN,
    OVERWRITE_EXISTING_PR,
    SKIP_PR,
    FORK,
    GIT_EMAIL,
    ON_DRIFT,
    DELETE_REMOVED
} = config

const runUrl = () => `${ GITHUB_SERVER_URL }/${ GITHUB_REPOSITORY }/actions/runs/${ process.env.GITHUB_RUN_ID || 0 }`

// Copies the configured files into the target working directory. Returns the managed files as { source, dest } pairs,
// and the configured dest paths that the target keeps as they are (missing source or replace: false).
async function syncFiles(git, files) {
    const managed = []
    const retained = []

    await forEach(files, async (file) => {
        if (fs.existsSync(file.source) === false) {
            retained.push(path.normalize(file.dest))
            return core.warning(`Source ${ file.source } not found`)
        }
        if (file.replace === false) retained.push(path.normalize(file.dest))

        const localDestination = `${ git.workingDir }/${ file.dest }`
        if (fs.existsSync(localDestination) && file.replace === false) return core.warning(`File(s) already exist(s) in destination and 'replace' option is set to false`)

        const isDirectory = await pathIsDirectory(file.source)
        const source = isDirectory ? addTrailingSlash(file.source) : file.source
        const dest = isDirectory ? addTrailingSlash(localDestination) : localDestination

        if (isDirectory) core.info(`Source is directory`)

        const written = await copy(source, dest, isDirectory, file)

        // Files with replace: false belong to the target repository once created
        if (file.replace !== false) managed.push(...written)

        await git.add(file.dest)
    })

    return { managed, retained }
}

// Deletes files of the previous manifest that the config no longer produces, except retained ones
async function deleteRemoved(git, previousManifest, manifestFiles, retained) {
    const isRetained = (dest) => retained.some((r) => dest === r || dest.startsWith(addTrailingSlash(r)))

    for (const dest of Object.keys(previousManifest?.files || {})) {
        if (manifestFiles[dest] !== undefined || isRetained(dest)) continue

        core.info(`Deleting ${ dest }: no longer in the sync config`)
        await fs.promises.rm(path.join(git.workingDir, dest), { force: true })
    }
}

async function manifestEntries(git, managed) {
    const entries = {}
    for (const file of managed) {
        entries[path.relative(git.workingDir, file.dest)] = {
            source: path.normalize(file.source),
            sha256: sha256(await fs.promises.readFile(file.dest))
        }
    }
    return entries
}

// Tells whether the open PR branch already has the staged content. The manifest is compared by its files only:
// a newer source SHA alone must not rebuild the branch (that would re-run CI and dismiss approvals).
async function openPrMatches(git, { files, manifestFile, manifestFiles, previousManifest }) {
    const paths = new Set([
        ...files.map((f) => f.dest),
        ...Object.keys(manifestFiles),
        ...Object.keys(previousManifest?.files || {})
    ])
    paths.delete(manifestFile)
    if (!await git.prHeadMatches([ ...paths ])) return false

    const prManifest = await git.prHeadFile(manifestFile)
    return prManifest !== undefined && sameFiles(parseManifest(prManifest).files, manifestFiles)
}

async function decoratePullRequest(git) {
    if (FORK) return

    if (PR_LABELS !== undefined && PR_LABELS.length > 0) {
        core.info(`Adding label(s) "${ PR_LABELS.join(', ') }" to PR`)
        await git.addPrLabels(PR_LABELS)
    }

    if (ASSIGNEES !== undefined && ASSIGNEES.length > 0) {
        core.info(`Adding assignee(s) "${ ASSIGNEES.join(', ') }" to PR`)
        await git.addPrAssignees(ASSIGNEES)
    }

    if (REVIEWERS !== undefined && REVIEWERS.length > 0) {
        core.info(`Adding reviewer(s) "${ REVIEWERS.join(', ') }" to PR`)
        await git.addPrReviewers(REVIEWERS)
    }

    if (TEAM_REVIEWERS !== undefined && TEAM_REVIEWERS.length > 0) {
        core.info(`Adding team reviewer(s) "${ TEAM_REVIEWERS.join(', ') }" to PR`)
        await git.addPrTeamReviewers(TEAM_REVIEWERS)
    }
}

// A commit is file-sync's own when it carries the Synced-From trailer or was authored by the PR author / sync identity
function isOwnCommit(commit, pullRequest) {
    if (/^Synced-From: /m.test(commit.commit.message)) return true
    if (pullRequest.user?.login && commit.author?.login === pullRequest.user.login) return true
    return Boolean(GIT_EMAIL) && commit.commit.author?.email === GIT_EMAIL
}

// Refuses to rebuild a PR branch that carries commits pushed by people, and tells them once in the PR
async function guardForeignCommits(git, pullRequest) {
    const foreign = (await git.listPrCommits()).filter((commit) => !isOwnCommit(commit, pullRequest))
    if (foreign.length === 0) return false

    core.warning(`PR #${ pullRequest.number } has commits that file-sync did not create; skipping ${ git.repo.fullName }`)
    if (DRY_RUN === false) {
        const comments = await git.listPrComments()
        if (!comments.some((comment) => comment.body?.includes(FOREIGN_COMMITS_MARKER))) {
            await git.commentPr(foreignCommitsComment({ runUrl: runUrl() }, foreign))
        }
    }
    return true
}

/**
 * Syncs the files of one target repository in a single commit.
 * Returns { status, pullRequest }, status being one of
 *   up-to-date, dry-run, pushed (SKIP_PR),
 *   created / updated (pull request), unchanged (open pull request already has this content),
 *   closed (open pull request no longer needed), skipped (pull request branch has foreign commits).
 */
export async function syncRepository(git, item) {
    await git.initRepo(item.repo)

    let existingPr
    if (SKIP_PR === false) {
        await git.createPrBranch()

        existingPr = OVERWRITE_EXISTING_PR ? await git.findExistingPr() : undefined
        if (existingPr) {
            core.info(`Found existing PR ${ existingPr.number }`)
            if (await guardForeignCommits(git, existingPr)) return { status: 'skipped', pullRequest: existingPr }
        }
    }

    const manifestFile = manifestPath(SYNC_NAME)
    const previousManifest = await readManifest(path.join(git.workingDir, manifestFile))

    // Local edits of managed files are overwritten by the sync: report them, or refuse with ON_DRIFT=fail
    const drift = previousManifest ? await findDrift(git.workingDir, previousManifest) : []
    const repoName = `${ item.repo.user }/${ item.repo.name }`
    if (drift.length > 0 && ON_DRIFT === 'fail') {
        throw new Error(`${ repoName }: ${ drift.map((d) => d.dest).join(', ') } was changed after the last sync and ON_DRIFT is fail`)
    }
    for (const d of drift) {
        core.warning(`${ d.dest } was ${ d.deleted ? 'deleted' : 'changed' } in ${ repoName } after the last sync; the sync overwrites it`)
    }

    core.info(`Locally syncing file(s) between source and target repository`)
    const { managed, retained } = await syncFiles(git, item.files)
    const manifestFiles = await manifestEntries(git, managed)
    if (DELETE_REMOVED) await deleteRemoved(git, previousManifest, manifestFiles, retained)

    for (const conflict of await findOwnershipConflicts(git.workingDir, SYNC_NAME, Object.keys(manifestFiles))) {
        core.warning(`${ conflict.dest } is also managed by the "${ conflict.stream }" sync stream`)
    }

    // Rewrite the manifest only together with file changes, so an unrelated source commit does not produce a sync
    const fileChanges = (await git.changedFiles()).filter(({ file }) => file !== manifestFile)
    if (fileChanges.length === 0 && previousManifest !== undefined && sameFiles(previousManifest.files, manifestFiles)) {
        core.info('File(s) already up to date')
        if (!existingPr) return { status: 'up-to-date' }

        core.info(`Closing PR #${ existingPr.number }: nothing left to sync`)
        if (DRY_RUN === false) {
            const history = { status: 'ok', to: await git.sourceSha(), commits: [] }
            await git.commentPr(closedComment({ serverUrl: GITHUB_SERVER_URL, repository: GITHUB_REPOSITORY, runUrl: runUrl(), history }))
            await git.closePr()
        }
        return { status: 'closed', pullRequest: existingPr }
    }

    await fs.promises.mkdir(path.dirname(path.join(git.workingDir, manifestFile)), { recursive: true })
    await fs.promises.writeFile(path.join(git.workingDir, manifestFile), serializeManifest({
        name: SYNC_NAME,
        repository: GITHUB_REPOSITORY,
        config: path.normalize(CONFIG_PATH),
        sha: await git.sourceSha(),
        files: manifestFiles
    }))
    await git.add(manifestFile)

    // The manifest is listed only when it is the whole change (adopting a repository)
    const changes = fileChanges.length > 0 ? fileChanges : await git.changedFiles()
    const sourceOf = (file) => manifestFiles[file]?.source || previousManifest?.files[file]?.source
    const files = changes.map(({ status, file }) => ({ status, dest: file, source: sourceOf(file) }))

    // Source commits since the last sync that touched the config or the sources of changed files
    const sources = [ ...new Set(files.map((f) => f.source).filter(Boolean)) ]
    const history = await sourceCommits({
        cwd: process.cwd(),
        anchor: previousManifest?.source.sha,
        paths: sources.length > 0 ? [ path.normalize(CONFIG_PATH), ...sources ] : []
    })
    if (history.status === 'shallow') {
        core.warning('The source checkout is shallow; check it out with fetch-depth: 0 to list source commits')
    }

    const context = {
        titlePrefix: TITLE_PREFIX,
        serverUrl: GITHUB_SERVER_URL,
        repository: GITHUB_REPOSITORY,
        config: path.normalize(CONFIG_PATH),
        runUrl: runUrl(),
        history,
        files,
        stream: SYNC_NAME,
        drift,
        extra: PR_BODY
    }
    const message = commitMessage(context)

    if (existingPr && await openPrMatches(git, { files, manifestFile, manifestFiles, previousManifest })) {
        core.info(`PR #${ existingPr.number } already contains these changes`)
        return { status: 'unchanged', pullRequest: existingPr }
    }

    if (DRY_RUN) {
        core.warning('Dry run, no changes will be pushed')
        core.info(`Commit message:\n${ message }`)
        if (SKIP_PR === false) core.info(`Pull request body:\n${ pullRequestBody(context) }`)
        return { status: 'dry-run' }
    }

    await git.commit(message)

    core.info(`Pushing changes to target repository`)
    await git.push()

    if (SKIP_PR) return { status: 'pushed' }

    const previousState = parseState(existingPr?.body)
    const pullRequest = await git.createOrUpdatePr(syncSubject(context), pullRequestBody(context))
    core.notice(`Pull Request #${ pullRequest.number } created/updated: ${ pullRequest.html_url }`)
    if (existingPr) await git.commentPr(journalComment(context, previousState))
    await decoratePullRequest(git)

    return { status: existingPr ? 'updated' : 'created', pullRequest }
}
