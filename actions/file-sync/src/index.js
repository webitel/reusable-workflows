import * as core from '@actions/core'

import Git from './git.js'
import { forEach, remove, setNunjucksTags } from './helpers.js'
import { syncRepository } from './sync.js'
import { summaryMarkdown } from './summary.js'

import { parseConfig, default as config } from './config.js'

const {
    SYNC_NAME,
    TMP_DIR,
    SKIP_CLEANUP,
    NUNJUCKS_BLOCK_START,
    NUNJUCKS_BLOCK_END,
    NUNJUCKS_VARIABLE_START,
    NUNJUCKS_VARIABLE_END,
    NUNJUCKS_COMMENT_START,
    NUNJUCKS_COMMENT_END
} = config

async function run() {
    // Configure Nunjucks tags if provided via inputs
    if (NUNJUCKS_BLOCK_START || NUNJUCKS_BLOCK_END || NUNJUCKS_VARIABLE_START || NUNJUCKS_VARIABLE_END || NUNJUCKS_COMMENT_START || NUNJUCKS_COMMENT_END) {
        setNunjucksTags({
            blockStart: NUNJUCKS_BLOCK_START,
            blockEnd: NUNJUCKS_BLOCK_END,
            variableStart: NUNJUCKS_VARIABLE_START,
            variableEnd: NUNJUCKS_VARIABLE_END,
            commentStart: NUNJUCKS_COMMENT_START,
            commentEnd: NUNJUCKS_COMMENT_END
        })
        core.info('Configured custom Nunjucks tags')
    }
    // Reuse octokit for each repo
    const git = new Git()

    const repos = await parseConfig()

    const prUrls = []
    const results = []

    await forEach(repos, async (item) => {
        core.info(`Repository Info`)
        core.info(`Slug		: ${ item.repo.name }`)
        core.info(`Owner		: ${ item.repo.user }`)
        core.info(`Https Url	: https://${ item.repo.fullName }`)
        core.info(`Branch		: ${ item.repo.branch }`)
        core.info('	')
        const repository = `${ item.repo.user }/${ item.repo.name }${ item.repo.branch === 'default' ? '' : `@${ item.repo.branch }` }`
        try {
            const result = await syncRepository(git, item)
            if ([ 'created', 'updated' ].includes(result.status)) prUrls.push(result.pullRequest.html_url)
            results.push({ repository, status: result.status, pullRequest: result.pullRequest?.html_url, drift: result.drift || 0 })

            core.info('	')
        } catch (err) {
            results.push({ repository, status: 'failed', error: err.message, drift: 0 })
            core.setFailed(err.message)
            core.debug(err)
        }
    })

    core.setOutput('results', results)
    if (process.env.GITHUB_STEP_SUMMARY) {
        await core.summary.addRaw(summaryMarkdown(SYNC_NAME, results), true).write()
    }

    // If we created any PRs, set their URLs as the output
    if (prUrls) {
        core.setOutput('pull_request_urls', prUrls)
    }

    if (SKIP_CLEANUP === true) {
        core.info('Skipping cleanup')
        return
    }

    await remove(TMP_DIR)
    core.info('Cleanup complete')
}

run()
    .catch((err) => {
        core.setFailed(err.message)
        core.debug(err)
    })
