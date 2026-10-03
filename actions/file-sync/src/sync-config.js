import * as core from '@actions/core'
import * as path from 'path'

const REPLACE_DEFAULT = true
const DELETE_ORPHANED_DEFAULT = false

// Top-level keys of the sync config; anything else there is a mistake
const CONFIG_KEYS = [ 'defaults', 'files', 'repos' ]

function parseRepoName(fullRepo, serverUrl) {
    let host = new URL(serverUrl).host

    if (fullRepo.startsWith('http')) {
        const url = new URL(fullRepo)
        host = url.host

        fullRepo = url.pathname.replace(/^\/+/, '') // Remove leading slash

        core.info('Using custom host')
    }

    const user = fullRepo.split('/')[0]
    const name = fullRepo.split('/')[1].split('@')[0]
    const branch = fullRepo.split('@')[1] || 'default'

    return {
        fullName: `${ host }/${ user }/${ name }`,
        uniqueName: `${ host }/${ user }/${ name }@${ branch }`,
        host,
        user,
        name,
        branch
    }
}

function parseExclude(text, src) {
    if (text === undefined || typeof text !== 'string') return undefined

    const files = text.split('\n').filter((i) => i)

    return files.map((file) => path.join(src, file))
}

function parseFile(item, template) {
    if (typeof item === 'string') item = { source: item }

    if (item.source === undefined) {
        core.warning('Warn: No source files specified')
        return undefined
    }

    return {
        source: item.source,
        dest: item.dest || item.source,
        template: template(item),
        replace: item.replace === undefined ? REPLACE_DEFAULT : item.replace,
        deleteOrphaned: item.deleteOrphaned === undefined ? DELETE_ORPHANED_DEFAULT : item.deleteOrphaned,
        header: item.header !== false,
        exclude: parseExclude(item.exclude, item.source)
    }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Objects are merged recursively; arrays and scalars of override replace those of base
export function deepMerge(base, override) {
    if (!isObject(base) || !isObject(override)) return override === undefined ? base : override

    const merged = { ...base }
    for (const [ key, value ] of Object.entries(override)) merged[key] = deepMerge(base[key], value)
    return merged
}

// when: "deb", "!deb" or "build.arm" — a truthy (or, with !, falsy) repository variable; a list needs all of them
function matches(when, vars) {
    if (when === undefined) return true
    if (Array.isArray(when)) return when.every((condition) => matches(condition, vars))

    const negate = String(when).startsWith('!')
    const value = String(when).replace(/^!/, '').split('.').reduce((v, key) => (isObject(v) ? v[key] : undefined), vars)
    return negate ? !value : Boolean(value)
}

/**
 * Parses a sync config into [{ repo, files }]:
 *   defaults: template variables shared by every repository
 *   files:    entries synced to every repository; .njk files are rendered with the repository's variables,
 *             `when` limits an entry to repositories whose variable is truthy (`!name` for falsy, a list for all of them)
 *   repos:    owner/name[@branch] -> the repository's template variables, deep-merged over defaults
 */
export function parseSyncConfig(config, { serverUrl }) {
    for (const key of Object.keys(config || {})) {
        if (!CONFIG_KEYS.includes(key)) throw new Error(`unknown key "${ key }" in the sync config`)
    }
    if (!isObject(config?.repos)) throw new Error('the sync config has no repos')

    return Object.entries(config.repos).map(([ name, repoVars ]) => {
        const vars = deepMerge(config.defaults || {}, repoVars || {})
        const template = (item) => {
            if (isObject(item.template)) return deepMerge(vars, item.template)
            if (item.template === true || (item.template === undefined && item.source.endsWith('.njk'))) return vars
            return false
        }

        const files = (config.files || [])
            .filter((item) => matches(item.when, vars))
            .map((item) => parseFile(item, template))
            .filter(Boolean)

        return { repo: parseRepoName(name, serverUrl), files }
    })
}
