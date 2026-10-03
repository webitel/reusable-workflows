import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

import config from './config.js'
import { forEach, addTrailingSlash, pathIsDirectory, copy } from './helpers.js'
import { manifestPath, readManifest, serializeManifest, sameFiles, sha256, findOwnershipConflicts } from './manifest.js'
import { sourceCommits } from './history.js'
import { syncSubject, commitMessage, pullRequestBody } from './message.js'

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
    FORK
} = config

// Copies the configured files into the target working directory and returns the managed ones as { source, dest } pairs.
async function syncFiles(git, files) {
    const managed = []

    await forEach(files, async (file) => {
        if (fs.existsSync(file.source) === false) return core.warning(`Source ${ file.source } not found`)

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

    return managed
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

/**
 * Syncs the files of one target repository in a single commit.
 * Returns { status, pullRequest }, status being up-to-date, dry-run, pushed (SKIP_PR) or pull-request.
 */
export async function syncRepository(git, item) {
    await git.initRepo(item.repo)

    let existingPr
    if (SKIP_PR === false) {
        await git.createPrBranch()

        // Check for existing PR and add warning message that the PR maybe about to change
        existingPr = OVERWRITE_EXISTING_PR ? await git.findExistingPr() : undefined
        if (existingPr && DRY_RUN === false) {
            core.info(`Found existing PR ${ existingPr.number }`)
            await git.setPrWarning()
        }
    }

    const manifestFile = manifestPath(SYNC_NAME)
    const previousManifest = await readManifest(path.join(git.workingDir, manifestFile))

    core.info(`Locally syncing file(s) between source and target repository`)
    const managed = await syncFiles(git, item.files)
    const manifestFiles = await manifestEntries(git, managed)

    for (const conflict of await findOwnershipConflicts(git.workingDir, SYNC_NAME, Object.keys(manifestFiles))) {
        core.warning(`${ conflict.dest } is also managed by the "${ conflict.stream }" sync stream`)
    }

    // Rewrite the manifest only together with file changes, so an unrelated source commit does not produce a sync
    const fileChanges = (await git.changedFiles()).filter(({ file }) => file !== manifestFile)
    if (fileChanges.length === 0 && previousManifest !== undefined && sameFiles(previousManifest.files, manifestFiles)) {
        core.info('File(s) already up to date')
        if (existingPr) await git.removePrWarning()
        return { status: 'up-to-date' }
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
        runUrl: `${ GITHUB_SERVER_URL }/${ GITHUB_REPOSITORY }/actions/runs/${ process.env.GITHUB_RUN_ID || 0 }`,
        history,
        files,
        extra: PR_BODY
    }
    const message = commitMessage(context)

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

    const pullRequest = await git.createOrUpdatePr(syncSubject(context), pullRequestBody(context))
    core.notice(`Pull Request #${ pullRequest.number } created/updated: ${ pullRequest.html_url }`)
    await decoratePullRequest(git)

    return { status: 'pull-request', pullRequest }
}
