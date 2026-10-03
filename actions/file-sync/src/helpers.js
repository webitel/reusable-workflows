import fs from 'fs-extra'
import { readdir } from 'node:fs/promises'
import { exec } from 'child_process'
import * as core from '@actions/core'
import * as path from 'path'

/**
 * Recursively list all files (including hidden) relative to dir.
 * Replaces node-readfiles which uses AMD format incompatible with rollup.
 */
async function listFiles(dir) {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true })
	return entries
		.filter(e => e.isFile())
		.map(e => path.relative(dir, path.join(e.parentPath || e.path, e.name)))
}
import nunjucks from 'nunjucks'

// Configure Nunjucks with defaults; tags can be overridden via setNunjucksTags
nunjucks.configure({ autoescape: true, trimBlocks: true, lstripBlocks: true })

export function setNunjucksTags(tags) {
    if (!tags) return
    // tags: { blockStart, blockEnd, variableStart, variableEnd, commentStart, commentEnd }
    try {
        nunjucks.configure({
            autoescape: true,
            trimBlocks: true,
            lstripBlocks: true,
            tags: {
                blockStart: tags.blockStart || '{%',
                blockEnd: tags.blockEnd || '%}',
                variableStart: tags.variableStart || '{{',
                variableEnd: tags.variableEnd || '}}',
                commentStart: tags.commentStart || '{#',
                commentEnd: tags.commentEnd || '#}'
            }
        })
    } catch (e) {
        // Fallback to default configuration on error
    }
}

// From https://github.com/toniov/p-iteration/blob/master/lib/static-methods.js - MIT © Antonio V
export async function forEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        // eslint-disable-next-line callback-return
        await callback(array[index], index, array)
    }
}

// From https://github.com/MartinKolarik/dedent-js/blob/master/src/index.ts - MIT © 2015 Martin Kolárik
export function dedent(templateStrings, ...values) {
    const matches = []
    const strings = typeof templateStrings === 'string' ? [ templateStrings ] : templateStrings.slice()
    strings[strings.length - 1] = strings[strings.length - 1].replace(/\r?\n([\t ]*)$/, '')
    for (let i = 0; i < strings.length; i++) {
        let match
        // eslint-disable-next-line no-cond-assign
        if (match = strings[i].match(/\n[\t ]+/g)) {
            matches.push(...match)
        }
    }
    if (matches.length) {
        const size = Math.min(...matches.map((value) => value.length - 1))
        const pattern = new RegExp(`\n[\t ]{${ size }}`, 'g')
        for (let i = 0; i < strings.length; i++) {
            strings[i] = strings[i].replace(pattern, '\n')
        }
    }
    strings[0] = strings[0].replace(/^\r?\n/, '')
    let string = strings[0]
    for (let i = 0; i < values.length; i++) {
        string += values[i] + strings[i + 1]
    }
    return string
}

// POSIX shell quoting: wraps value in single quotes, escaping embedded single quotes.
// Prevents shell injection when interpolating untrusted values into commands.
export function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

export function execCmd(command, workingDir, trimResult = true) {
    core.debug(`EXEC: "${ command }" IN ${ workingDir }`)
    return new Promise((resolve, reject) => {
        exec(
            command,
            {
                cwd: workingDir,
                maxBuffer: 1024 * 1024 * 4
            },
            function(error, stdout) {
                error ? reject(error) : resolve(
                    trimResult ? stdout.trim() : stdout
                )
            }
        )
    })
}

export function addTrailingSlash(str) {
    return str.endsWith('/') ? str : str + '/'
}

export async function pathIsDirectory(path) {
    const stat = await fs.lstat(path)
    return stat.isDirectory()
}

export async function write(src, dest, context) {
    if (typeof context !== 'object') {
        context = {}
    }
    const content = nunjucks.render(src, context)
    await fs.outputFile(dest, content)
}

// Copies (or renders, for templates) src to dest and returns the files written, as { source, dest } pairs.
export async function copy(src, dest, isDirectory, file) {
    const exclude = file.exclude || []

    // Exclude entries are source paths of files, or of folders when they end with a slash
    const isExcluded = (sourcePath) => exclude.some((entry) => entry.endsWith('/') ? sourcePath.startsWith(entry) : sourcePath === entry)

    const copyFile = async (source, target) => {
        if (file.template) {
            core.debug(`Render file ${ source } to ${ target }`)
            await write(source, target, file.template)
        } else {
            core.debug(`Copy ${ source } to ${ target }`)
            await fs.copy(source, target)
        }
    }

    const written = []
    if (isDirectory) {
        for (const relative of (await listFiles(src)).sort()) {
            const source = path.join(src, relative)
            if (isExcluded(source)) {
                core.debug(`Excluding file ${ source }`)
                continue
            }

            const target = path.join(dest, relative)
            await copyFile(source, target)
            written.push({ source, dest: target })
        }
    } else {
        await copyFile(src, dest)
        written.push({ source: src, dest })
    }

    // If it is a directory and deleteOrphaned is enabled - check if there are any files that were removed from source dir and remove them in destination dir
    if (isDirectory && file.deleteOrphaned) {

        const srcFileList = await listFiles(src)
        const destFileList = await listFiles(dest)

        for (const destFile of destFileList) {
            if (destFile.split(path.sep)[0] === '.git') continue
            if (srcFileList.indexOf(destFile) === -1) {
                const filePath = path.join(dest, destFile)
                core.debug(`Found an orphaned file in the target repo - ${ filePath }`)

                if (isExcluded(path.join(src, destFile))) {
                    core.debug(`Excluding file ${ destFile }`)
                } else {
                    core.debug(`Removing file ${ destFile }`)
                    await fs.remove(filePath)
                }
            }
        }
    }

    return written
}

export async function remove(src) {

    core.debug(`RM: ${ src }`)

    return fs.remove(src)
}
