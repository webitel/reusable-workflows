import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import fs from 'fs-extra'
import { getInput } from 'action-input-parser'

import { manifestName } from './manifest.js'
import { parseSyncConfig } from './sync-config.js'

let context

try {

    let isInstallationToken = false
    let token = getInput({
        key: 'GH_PAT'
    })

    if (!token) {
        token = getInput({
            key: 'GH_INSTALLATION_TOKEN'
        })
        isInstallationToken = true
        if (!token) {
            core.setFailed('You must provide either GH_PAT or GH_INSTALLATION_TOKEN')
            process.exit(1)
        }
    }

    context = {
        GITHUB_TOKEN: token,
        GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL || 'https://github.com',
        IS_INSTALLATION_TOKEN: isInstallationToken,
        GIT_EMAIL: getInput({
            key: 'GIT_EMAIL'
        }),
        GIT_USERNAME: getInput({
            key: 'GIT_USERNAME'
        }),
        CONFIG_PATH: getInput({
            key: 'CONFIG_PATH',
            default: '.github/sync.yml'
        }),
        IS_FINE_GRAINED: getInput({
            key: 'IS_FINE_GRAINED',
            default: false
        }),
        // Read directly: action-input-parser treats an empty value as unset, which makes the prefix impossible to disable.
        TITLE_PREFIX: process.env.INPUT_TITLE_PREFIX !== undefined ? process.env.INPUT_TITLE_PREFIX.trim() : 'chore(sync)',
        PR_LABELS: getInput({
            key: 'PR_LABELS',
            default: [ 'sync' ],
            type: 'array',
            disableable: true
        }),
        PR_BODY: getInput({
            key: 'PR_BODY',
            default: ''
        }),
        ASSIGNEES: getInput({
            key: 'ASSIGNEES',
            type: 'array'
        }),
        REVIEWERS: getInput({
            key: 'REVIEWERS',
            type: 'array'
        }),
        TEAM_REVIEWERS: getInput({
            key: 'TEAM_REVIEWERS',
            type: 'array'
        }),
        TMP_DIR: getInput({
            key: 'TMP_DIR',
            default: `tmp-${ Date.now().toString() }`
        }),
        DRY_RUN: getInput({
            key: 'DRY_RUN',
            type: 'boolean',
            default: false
        }),
        STATUS_ISSUE: getInput({
            key: 'STATUS_ISSUE'
        }),
        FILE_HEADER: getInput({
            key: 'FILE_HEADER',
            type: 'boolean',
            default: false
        }),
        DELETE_REMOVED: getInput({
            key: 'DELETE_REMOVED',
            type: 'boolean',
            default: true
        }),
        SKIP_CLEANUP: getInput({
            key: 'SKIP_CLEANUP',
            type: 'boolean',
            default: false
        }),
        OVERWRITE_EXISTING_PR: getInput({
            key: 'OVERWRITE_EXISTING_PR',
            type: 'boolean',
            default: true
        }),
        NUNJUCKS_BLOCK_START: getInput({
            key: 'NUNJUCKS_BLOCK_START',
            disableable: true
        }),
        NUNJUCKS_BLOCK_END: getInput({
            key: 'NUNJUCKS_BLOCK_END',
            disableable: true
        }),
        NUNJUCKS_VARIABLE_START: getInput({
            key: 'NUNJUCKS_VARIABLE_START',
            disableable: true
        }),
        NUNJUCKS_VARIABLE_END: getInput({
            key: 'NUNJUCKS_VARIABLE_END',
            disableable: true
        }),
        NUNJUCKS_COMMENT_START: getInput({
            key: 'NUNJUCKS_COMMENT_START',
            disableable: true
        }),
        NUNJUCKS_COMMENT_END: getInput({
            key: 'NUNJUCKS_COMMENT_END',
            disableable: true
        }),
        GITHUB_REPOSITORY: getInput({
            key: 'GITHUB_REPOSITORY',
            required: true
        }),
        SKIP_PR: getInput({
            key: 'SKIP_PR',
            type: 'boolean',
            default: false
        }),
        BRANCH_PREFIX: getInput({
            key: 'BRANCH_PREFIX',
            default: 'repo-sync/SOURCE_REPO_NAME'
        }),
        FORK: getInput({
            key: 'FORK',
            default: false,
            disableable: true
        })
    }

    context.ON_DRIFT = getInput({
        key: 'ON_DRIFT',
        default: 'warn'
    })
    if (![ 'warn', 'fail' ].includes(context.ON_DRIFT)) {
        throw new Error(`ON_DRIFT must be warn or fail, got ${ context.ON_DRIFT }`)
    }

    context.SYNC_NAME = getInput({
        key: 'SYNC_NAME',
        default: manifestName(context.CONFIG_PATH)
    })

    core.setSecret(context.GITHUB_TOKEN)

    core.debug(JSON.stringify(context, null, 2))

    while (fs.existsSync(context.TMP_DIR)) {
        context.TMP_DIR = `tmp-${ Date.now().toString() }`
        core.warning(`TEMP_DIR already exists. Using "${ context.TMP_DIR }" now.`)
    }

} catch (err) {
    core.setFailed(err.message)
    process.exit(1)
}

export async function parseConfig(configPath = context.CONFIG_PATH) {
    const fileContent = await fs.promises.readFile(configPath)

    return parseSyncConfig(yaml.load(fileContent.toString()), { serverUrl: context.GITHUB_SERVER_URL })
}

export default context