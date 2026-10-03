import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as yaml from 'js-yaml'

import { parseSyncConfig } from '../src/sync-config.js'

const parse = (text) => parseSyncConfig(yaml.load(text), { serverUrl: 'https://github.com' })
const byRepo = (repos) => Object.fromEntries(repos.map((r) => [ `${ r.repo.user }/${ r.repo.name }@${ r.repo.branch }`, r.files ]))

const STACK = `
defaults:
  version: v2
  build:
    flags: -s -w
    arch: amd64
files:
  - source: golang/workflow.yml.njk
    dest: .github/workflows/workflow.yml
  - source: golang/.gitignore
    dest: .gitignore
  - source: common/debian/
    dest: deploy/debian/
    when: deb
  - source: common/no-deb.txt
    dest: no-deb.txt
    when: '!deb'
  - source: common/arm.txt
    dest: arm.txt
    when: build.arm
  - source: common/settings.yml
    dest: settings.yml
    template:
      extra: 1
  - source: golang/.idea
    dest: .idea
    header: false
repos:
  webitel/cases:
    name: cases
    deb: true
    build:
      arch: arm64
      arm: true
  webitel/cli@develop:
`

test('every repository gets the shared files filtered by when', () => {
    const repos = byRepo(parse(STACK))

    assert.deepEqual(Object.keys(repos), [ 'webitel/cases@default', 'webitel/cli@develop' ])
    assert.deepEqual(repos['webitel/cases@default'].map((f) => f.dest), [ '.github/workflows/workflow.yml', '.gitignore', 'deploy/debian/', 'arm.txt', 'settings.yml', '.idea' ])
    assert.deepEqual(repos['webitel/cli@develop'].map((f) => f.dest), [ '.github/workflows/workflow.yml', '.gitignore', 'no-deb.txt', 'settings.yml', '.idea' ])
})

test('.njk files render with the defaults deep-merged with the repository variables', () => {
    const [ cases, cli ] = parse(STACK)

    assert.deepEqual(cases.files[0].template, { version: 'v2', build: { flags: '-s -w', arch: 'arm64', arm: true }, name: 'cases', deb: true })
    assert.deepEqual(cli.files[0].template, { version: 'v2', build: { flags: '-s -w', arch: 'amd64' } })
})

test('other files are copied unless the entry asks for a template', () => {
    const [ cases ] = parse(STACK)
    const file = (dest) => cases.files.find((f) => f.dest === dest)

    assert.equal(file('.gitignore').template, false)
    assert.equal(file('settings.yml').template.extra, 1)
    assert.equal(file('settings.yml').template.name, 'cases')
    assert.equal(file('.idea').header, false)
})

test('unknown top-level keys are rejected', () => {
    assert.throws(() => parse('repos:\n  webitel/a:\nfile:\n  - a.yml\n'), /unknown key "file" in the sync config/)
})

test('repos is required', () => {
    assert.throws(() => parse('files:\n  - a.yml\n'), /the sync config has no repos/)
})

test('a config of repository keys is rejected', () => {
    assert.throws(() => parse('webitel/a:\n  - a.yml\n'), /unknown key "webitel\/a" in the sync config/)
})

test('a when list requires every condition', () => {
    const repos = byRepo(parse(`
files:
  - source: freeswitch/public-trigger.yml.njk
    dest: public-trigger.yml
    when: [ freeswitch, public ]
repos:
  webitel/mod-a:
    freeswitch: true
    public: mod-a-public
  webitel/mod-b:
    freeswitch: true
  webitel/pg:
    public: pg-public
`))

    assert.deepEqual(Object.fromEntries(Object.entries(repos).map(([ name, files ]) => [ name, files.length ])), {
        'webitel/mod-a@default': 1,
        'webitel/mod-b@default': 0,
        'webitel/pg@default': 0
    })
})
