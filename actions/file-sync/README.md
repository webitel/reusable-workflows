<div align="center">

# Repo File Sync Action

Keep files like Action workflows or entire directories in sync between multiple repositories.

</div>

## 👋 Introduction

With [file-sync](https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync) you can sync files, like workflow `.yml` files, configuration files or whole directories between repositories or branches. It works by running a GitHub Action in your main repository everytime you push something to that repo. The action will use a `sync.yml` config file to figure out which files it should sync where. If it finds a file which is out of sync it will open a pull request in the target repository with the changes.

## 🚀 Features

- Keep workflows, configs or whole directories in sync across many repositories from one config: shared files plus per-repository template variables
- One pull request per target repository, titled after the source commits and their Jira keys, kept up to date until merged
- A manifest of managed files in every target: drift detection and removal of files dropped from the config
- Optional "DO NOT EDIT" headers in synced files, a job summary and a pinned status issue
- Render [Jinja](https://jinja.palletsprojects.com/)-style templates with [Nunjucks](https://mozilla.github.io/nunjucks/)
- Label, assign and request reviews on pull requests

## ⬆️ Upgrading from v2

v3 changes how sync commits and pull requests look and adds a manifest to every target repository:

- **Removed inputs**: `COMMIT_EACH_FILE`, `ORIGINAL_MESSAGE`, `COMMIT_AS_PR_TITLE`, `COMMIT_PREFIX`, `COMMIT_BODY`. Each sync is one commit whose subject is built from the source commits; use `TITLE_PREFIX` to change its prefix.
- **New inputs**: `TITLE_PREFIX`, `SYNC_NAME`, `FILE_HEADER`, `ON_DRIFT`, `DELETE_REMOVED`, `STATUS_ISSUE`.
- **New config format**: `defaults` + `files` + `repos` (see [Sync Configuration](#%EF%B8%8F-sync-configuration)) replaces per-repository file lists, `group` and `definitions`. Configs in the v2 format are rejected.
- **Check out the source with `fetch-depth: 0`**, otherwise source commits cannot be listed.
- **First run**: every target repository gets one pull request that adds `.github/file-sync/<SYNC_NAME>.yml` (and the headers, with `FILE_HEADER: true`). Merge these before relying on the source commit ranges in later pull requests.
- An open v2 sync pull request is updated in place; its commits are recognized as file-sync's own.

## 📚 Usage


### Workflow

Create a `.yml` file in your `.github/workflows` folder (you can find more info about the structure in the [GitHub Docs](https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions)):

**.github/workflows/sync.yml**

```yml
name: Sync Files
on:
  push:
    branches:
      - main

  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v6
        with:
          # Full history lets the action list the source commits each sync brings
          fetch-depth: 0

      - name: Run GitHub File Sync
        uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
        with:
          GH_PAT: ${{ secrets.GH_PAT }}
```

#### Token

In order for the Action to access your repositories you have to specify a [Personal Access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) as the value for `GH_PAT` (`GITHUB_TOKEN` will **not** work). The PAT needs the full repo scope.

It is recommended to set the token as a
[Repository secret](https://docs.github.com/en/free-pro-team@latest/actions/reference/encrypted-secrets#creating-encrypted-secrets-for-a-repository).

Alternatively, you can provide the token of a GitHub App Installation via the `GH_INSTALLATION_TOKEN` input. You can obtain such token for example via [this](https://github.com/marketplace/actions/github-app-token) action. Tokens from apps have the advantage that they provide more granular access control.

The app needs to be configured for each repo you want to sync to, and have the `Contents` read & write and `Metadata` read-only permission. If you want to use PRs (default setting) you additionally need `Pull requests` read & write access, and to sync workflow files you need `Workflows` read & write access.

If using an installation token you are required to provide the `GIT_EMAIL` and `GIT_USERNAME` input.

### Sync configuration

The last step is to create a `.yml` file in the `.github` folder of your repository that lists the files and the repositories to sync them to:

**.github/sync.yml**

```yml
files:
  - source: workflows/lint.yml
    dest: .github/workflows/lint.yml

repos:
  user/repository:
  user/repository2:
```

More info on the format [below](#%EF%B8%8F-sync-configuration).

## ⚙️ Action Inputs

Here are all the inputs [file-sync](https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync) takes:

| Key                       | Value                                                                                                                                          | Required                                         | Default                        |
|---------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|--------------------------------|
| `GH_PAT`                  | Your [Personal Access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) | **`GH_PAT` or `GH_INSTALLATION_TOKEN` required** | N/A                            |
| `GH_INSTALLATION_TOKEN`   | Token from a GitHub App installation                                                                                                           | **`GH_PAT` or `GH_INSTALLATION_TOKEN` required** | N/A                            |
| `CONFIG_PATH`             | Path to the sync configuration file                                                                                                            | **No**                                           | .github/sync.yml               |
| `SYNC_NAME`               | Name of the sync stream; the manifest is written to `.github/file-sync/<SYNC_NAME>.yml` in target repositories                                | **No**                                           | `CONFIG_PATH` without `.github/` and extension, `/` → `-` |
| `ON_DRIFT`                | `warn`: overwrite synced files edited in the target and list them in the PR; `fail`: skip such a repository and fail the run                  | **No**                                           | warn                           |
| `DELETE_REMOVED`          | Delete managed files that the sync config no longer produces (kept when the entry switched to `replace: false` or its source is missing)         | **No**                                           | true                           |
| `STATUS_ISSUE`            | Title of a status issue in the source repository where every stream keeps a comment with its latest results                                  | **No**                                           | N/A                            |
| `FILE_HEADER`             | Put a "Code generated by file-sync … DO NOT EDIT." header with the source path on top of synced files                                        | **No**                                           | false                          |
| `IS_FINE_GRAINED`         | Labels the GH_PAT as a fine grained token                                                                                                      | **No**                                           | false                          |
| `PR_LABELS`               | Labels which will be added to the pull request. Set to false to turn off                                                                       | **No**                                           | sync                           |
| `ASSIGNEES`               | Users to assign to the pull request                                                                                                            | **No**                                           | N/A                            |
| `REVIEWERS`               | Users to request a review of the pull request from                                                                                             | **No**                                           | N/A                            |
| `TEAM_REVIEWERS`          | Teams to request a review of the pull request from                                                                                             | **No**                                           | N/A                            |
| `TITLE_PREFIX`            | Prefix of the sync commit subject and PR title, followed by the Jira keys of the source commits; set to an empty string to disable          | **No**                                           | chore(sync)                    |
| `PR_BODY`                 | Additional content to add in the PR description.                                                                                               | **No**                                           | ''                             |
| `GIT_EMAIL`               | The e-mail address used to commit the synced files                                                                                             | **Only when using installation token**           | the email of the PAT used      |
| `GIT_USERNAME`            | The username used to commit the synced files                                                                                                   | **Only when using installation token**           | the username of the PAT used   |
| `OVERWRITE_EXISTING_PR`   | Overwrite any existing Sync PR with the new changes                                                                                            | **No**                                           | true                           |
| `BRANCH_PREFIX`           | Specify a different prefix for the new branch in the target repo                                                                               | **No**                                           | repo-sync/SOURCE_REPO_NAME     |
| `TMP_DIR`                 | The working directory where all git operations will be done                                                                                    | **No**                                           | tmp-${ Date.now().toString() } |
| `DRY_RUN`                 | Run everything except that nothing will be pushed                                                                                              | **No**                                           | false                          |
| `SKIP_CLEANUP`            | Skips removing the temporary directory. Useful for debugging                                                                                   | **No**                                           | false                          |
| `SKIP_PR`                 | Skips creating a Pull Request and pushes directly to the default branch                                                                        | **No**                                           | false                          |
| `FORK`                    | A Github account username. Changes will be pushed to a fork of target repos on this account.                                                   | **No**                                           | false                          |
| `NUNJUCKS_BLOCK_START`    | Custom Nunjucks block start tag (e.g., `((*`).                                                                                                 | **No**                                           | `{%`                           |
| `NUNJUCKS_BLOCK_END`      | Custom Nunjucks block end tag (e.g., `*))`).                                                                                                   | **No**                                           | `%}`                           |
| `NUNJUCKS_VARIABLE_START` | Custom Nunjucks variable start tag (e.g., `(((`).                                                                                              | **No**                                           | `{{`                           |
| `NUNJUCKS_VARIABLE_END`   | Custom Nunjucks variable end tag (e.g., `)))`).                                                                                                | **No**                                           | `}}`                           |
| `NUNJUCKS_COMMENT_START`  | Custom Nunjucks comment start tag (e.g., `((=`).                                                                                               | **No**                                           | `{#`                           |
| `NUNJUCKS_COMMENT_END`    | Custom Nunjucks comment end tag (e.g., `=))`).                                                                                                 | **No**                                           | `#}`                           |

### Outputs

The action sets two outputs:

- `pull_request_urls` — URLs of the pull requests created or updated by this run, e.g. `'["https://github.com/username/repository/pull/number", "..."]'`.
- `results` — one entry per target repository, e.g. `[{"repository":"webitel/cases","status":"updated","pullRequest":"https://github.com/webitel/cases/pull/12","drift":0}]`. `status` is one of `created`, `updated`, `unchanged`, `up-to-date`, `closed`, `skipped`, `pushed`, `dry-run`, `failed` (with `error`).

The same results are written as a table to the job summary.

## 🛠️ Sync Configuration

The sync config (`.github/sync.yml` by default, see `CONFIG_PATH`) describes a set of repositories that share the same files, with per-repository values for templates:

```yml
# Template variables shared by every repository
defaults:
  version: v2
  branch: main

# Synced to every repository below
files:
  - source: golang/workflows/workflow.yml.njk   # .njk files are rendered with the repository's variables
    dest: .github/workflows/workflow.yml

  - source: golang/configs/.gitignore           # other files are copied as they are
    dest: .gitignore

  - source: common/deploy/debian/
    dest: deploy/debian/
    when: deb                                   # only repositories with a truthy `deb`

  - source: golang/.idea
    dest: .idea
    header: false

# owner/name[@branch]: the repository's template variables, deep-merged over defaults
repos:
  webitel/cases:
    name: webitel-cases
    deb: true
    build:
      binary-name: webitel-cases

  webitel/chat-migration-cli:
    name: chat-migration-cli
    versioning: semver
```

- Adding a repository means adding one entry under `repos` (the value may be empty).
- Only `defaults`, `files` and `repos` are allowed at the top level, so a typo fails the run instead of silently syncing nothing.
- The list of repositories is easy to read from the config, e.g. to scope a GitHub App token: `yq -r '.repos | keys | .[] | sub("^[^/]+/"; "") | sub("@.*$"; "")' .github/sync.yml`.

### Repositories

- `owner/name` syncs to the default branch, `owner/name@branch` to another branch (the same repository can be listed with several branches).
- A key starting with `https://` targets another host, e.g. a GitHub Enterprise Server: `https://custom.host/owner/name`.
- The value holds the repository's template variables. They are deep-merged over `defaults`: objects are merged key by key, everything else is replaced.

### File entries

Each entry of `files` is a path (`- LICENSE`, synced to the same path) or an object:

| Key | Description | Default |
|---|---|---|
| `source` | File or directory in the source repository. A directory syncs everything below it | — |
| `dest` | Path in the target repository | `source` |
| `when` | Sync only to repositories whose variable is truthy: `deb`, negated `!deb`, a path `build.arm`, or a list that must all hold `[ freeswitch, public ]` | every repository |
| `template` | Render with [Nunjucks](https://mozilla.github.io/nunjucks/): `true`, or an object of extra variables merged over the repository's. Files ending with `.njk` are rendered by default; `false` copies them as they are | `.njk` files only |
| `replace` | `false` creates the file only when it does not exist yet; the target repository owns it afterwards | `true` |
| `exclude` | Paths below a directory `source` to skip, one per line, relative to `source`; an entry ending with `/` skips a whole folder | — |
| `deleteOrphaned` | For a directory: delete files in `dest` that do not exist in `source` | `false` |
| `header` | `false` skips the [generated-file header](#generated-file-header) | `true` |

```yml
files:
  - LICENSE

  - source: workflows/
    dest: .github/workflows/
    deleteOrphaned: true
    exclude: |
      node.yml
      experimental/
```

### Templates

Templates use [Jinja](https://jinja.palletsprojects.com/)-style syntax compiled by Nunjucks; see its [template syntax](https://mozilla.github.io/nunjucks/templating.html) for variables, filters, blocks and `extends` (with a path relative to the source repository). With the repository variables from the example above:

```yml
# golang/workflows/workflow.yml.njk
name: Workflow ( {{ name }} )
uses: webitel/reusable-workflows/.github/workflows/golang-build.yml@{{ version }}
```

If source files contain the default tags (`{% %}`, `{{ }}`, `{# #}`) — GitHub Actions expressions do — choose other delimiters with the `NUNJUCKS_*` inputs:

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    NUNJUCKS_BLOCK_START: '((*'
    NUNJUCKS_BLOCK_END: '*))'
    NUNJUCKS_VARIABLE_START: '((('
    NUNJUCKS_VARIABLE_END: ')))'
    NUNJUCKS_COMMENT_START: '((='
    NUNJUCKS_COMMENT_END: '=))'
```

Templates are rendered with autoescaping on: pass multi-line or quoted values through `| safe`.

### Sync commits and pull requests

Each sync produces one commit per target repository. Its subject names the source commits it brings, with their Jira keys (taken from bracketed lists such as `[PE-117]`):

| Source commits since the last sync | Subject |
|---|---|
| one | `chore(sync)[PE-117]: take version metadata from prepare outputs` (the source subject without its `type(scope)[keys]:` prefix) |
| several | `chore(sync)[PE-117,PE-118]: 2 changes from webitel/reusable-configs` |
| unknown (first sync, shallow checkout) | `chore(sync): sync files from webitel/reusable-configs@1a2b3c4` |

```
chore(sync)[PE-117,PE-118]: 2 changes from webitel/reusable-configs

Source: webitel/reusable-configs 9f8e7d6..1a2b3c4 (golang/sync.yml)

Changes:
- feat(golang)[PE-117]: take version metadata from prepare outputs (56c90e3)
- feat(golang)[PE-118]: sync workflows to chat-migration-cli (48bb00e)

Files:
- M .github/workflows/pull-request.yml <- golang/workflows/pull-request.yml.njk
- A .github/workflows/release-branch.yml <- common/workflows/release-branch.yml

Synced-From: webitel/reusable-configs@1a2b3c4d5e6f...
Sync-Config: golang/sync.yml
Sync-Run: https://github.com/webitel/reusable-configs/actions/runs/123
```

The pull request uses the subject as its title; its body links the source commit range, each source commit and each source file. `TITLE_PREFIX` changes `chore(sync)`.

### Open sync pull requests

With `OVERWRITE_EXISTING_PR` (default) each target repository has at most one sync pull request. Every run rebuilds its branch from the current base branch, so syncs that were not merged yet accumulate into it: the commit and title always cover all source commits since the last merged sync.

- **New changes**: the branch is force-pushed, the title and body are updated and a comment lists the source commits added since the previous update.
- **Same content**: when the branch already has exactly the files the sync would produce, nothing is pushed or edited, so CI does not re-run and approvals stay.
- **Nothing left to sync** (e.g. the source change was reverted): the pull request is closed with a comment and its branch is deleted.
- **Commits pushed by people**: if the branch has commits file-sync did not create (no `Synced-From:` trailer, not authored by the pull request author or `GIT_EMAIL`), the repository is skipped with a warning and a one-time comment instead of dropping those commits.

The pull request body ends with a hidden `<!-- file-sync:state … -->` marker that records the source commits it contains.

### Status issue

Set `STATUS_ISSUE` to a title (e.g. `File sync status`) to get one issue in the source repository that shows the state of every sync stream. The issue is found by a hidden marker, created and pinned on first use; each stream (`SYNC_NAME`) owns one comment in it and rewrites it on every run, so streams running at the same time never overwrite each other:

```
### golang-sync · `golang/sync.yml`
Updated by run #123 at 2026-10-03 14:20 UTC from `1a2b3c4`.

**Needs attention**
- ⛔ webitel/cases: #83 has commits file-sync did not create
- ⚠️ webitel/engine: 1 local change overwritten in #12
- 🕒 webitel/logger: #84 open since 2026-09-20
- ❌ webitel/storage: <error>

| Repository     | Synced to            | Pull request       | Result        |
|----------------|----------------------|--------------------|---------------|
| webitel/cases  | `4341ec7` · 2026-10-01 | #83 · since 2026-09-30 | ⚠️ skipped |
| webitel/fts    | `1a2b3c4` · 2026-10-03 |                    | ✅ up to date |
```

- "Synced to" is the source commit the target's base branch matches (from its manifest).
- Sync pull requests open longer than 7 days are listed as needing attention.
- The comment reflects the latest run, so schedule the sync workflow (e.g. daily) to keep it current after pull requests are merged; a run without changes pushes nothing.
- The token needs `issues: write` on the source repository (for a GitHub App token: include the source repository and grant the Issues permission). Pinning may need more rights; a warning asks to pin it manually otherwise.
- Updating the issue never fails the sync; a dry run prints the comment instead.

### Generated-file header

With `FILE_HEADER: true` every synced file whose format has comments starts with a header, so it is clear in the target repository that the file is synced and where to change it:

```yml
# Code generated by file-sync from webitel/reusable-configs. DO NOT EDIT.
# Source: golang/workflows/pull-request.yml.njk
# Edit the source instead; local changes are overwritten on the next sync.

name: PR ( cases )
```

| Comment syntax | Files |
|---|---|
| `#` | `.yml`, `.yaml`, `.sh`, `.bash`, `.py`, `.toml`, `.ini`, `.cfg`, `.conf`, `.properties`, `Makefile`, `Dockerfile*`, `.env*`, `.gitignore`, `.dockerignore`, `.gitattributes`, `.editorconfig` |
| `//` | `.go`, `.js`, `.mjs`, `.cjs`, `.ts`, `.jsonc`, `.json` under `.vscode/` |
| `<!-- -->` | `.xml`, `.iml`, `.html` |

- Other files (plain `.json`, Markdown, binaries, unknown types) are left as they are; the manifest still lists them.
- The header goes after a shebang or an XML declaration, is added after template rendering, and is replaced (never duplicated) on later syncs. It has no SHA or date, so it does not change on every sync.
- Go files get the standard `// Code generated … DO NOT EDIT.` marker that Go tooling and GitHub recognize.
- Skip it per entry with `header: false`, e.g. for IDE settings that the IDE rewrites without comments:

```yml
files:
  - source: golang/.idea
    dest: .idea
    header: false
```

### Manifest of managed files

Every target repository gets a manifest at `.github/file-sync/<SYNC_NAME>.yml`, written in the same commit as the synced files. It lists each managed file with its source path and the SHA-256 of its content, plus the source repository, config and commit the content comes from:

```yml
# Code generated by file-sync. DO NOT EDIT.
# Files managed by the "golang-sync" stream of webitel/reusable-configs.
version: 1
source:
  repository: webitel/reusable-configs
  config: golang/sync.yml
  sha: 1a2b3c4d5e6f...
files:
  .github/workflows/pull-request.yml:
    source: golang/workflows/pull-request.yml.njk
    sha256: 9f0c...
```

- Directories are listed file by file; files with `replace: false` are not listed, because the target repository owns them once they exist.
- The manifest only changes together with the synced files, so source commits that do not affect a repository do not open sync pull requests there.
- `source.sha` marks the last synced source commit. The next sync lists the source commits since then that touched the sync config or the sources of changed files; this needs the source repository checked out with `fetch-depth: 0` (a warning is logged otherwise).
- **Removed files**: a file listed in the manifest that the config no longer produces (entry removed, file removed from a synced directory) is deleted with `DELETE_REMOVED: true` (default). It is kept when its entry switched to `replace: false` or the configured source is missing; with `DELETE_REMOVED: false` it is kept and simply no longer managed.
- **Drift**: a managed file whose content no longer matches its hash was edited (or deleted) in the target repository after the last sync. With `ON_DRIFT: warn` (default) the sync restores it, logs a warning and lists it under "Local changes overwritten" in the PR and in the commit message; with `ON_DRIFT: fail` the repository is skipped and the run fails.
- Each sync config should use its own `SYNC_NAME` (the default derived from `CONFIG_PATH` already differs per config). A warning is logged when a file is listed in the manifest of another stream.

## 📖 Examples

Here are a few examples to help you get started!

### Custom labels

By default [file-sync](https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync) will add the `sync` label to every PR it creates. You can turn this off by setting `PR_LABELS` to false, or specify your own labels:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    PR_LABELS: |
      file-sync
      automerge
```

### Assign a user to the PR

You can tell [file-sync](https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync) to assign users to the PR with `ASSIGNEES`:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    ASSIGNEES: user
```

### Request a PR review

You can tell [file-sync](https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync) to request a review of the PR from users with `REVIEWERS` and from teams with `TEAM_REVIEWERS`:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    REVIEWERS: |
      user1

    TEAM_REVIEWERS: engineering
```

### Different branch prefix

By default all new branches created in the target repo will be in the this format: `repo-sync/SOURCE_REPO_NAME/SOURCE_BRANCH_NAME`, with the SOURCE_REPO_NAME being replaced with the name of the source repo and SOURCE_BRANCH_NAME with the name of the source branch.

If your repo name contains invalid characters, like a dot ([BetaHuhn/repo-file-sync-action#32](https://github.com/BetaHuhn/repo-file-sync-action/issues/32)), you can specify a different prefix for the branch (the text before `/SOURCE_BRANCH_NAME`):

**.github/workflows/sync.yml**

```yml
uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
with:
    GH_PAT: ${{ secrets.GH_PAT }}
    BRANCH_PREFIX: custom-branch
```

The new branch will then be `custom-branch/SOURCE_BRANCH_NAME`.

> You can use `SOURCE_REPO_NAME` in your custom branch prefix as well and it will be replaced with the actual repo name

### Add content to the PR body

You can add more content to the PR body with the `PR_BODY` option. For example:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    PR_BODY: This is your custom PR Body
```

It is added after the list of files, above the footer.

### Fork and pull request workflow

If you do not wish to grant this action write access to target repositories, you can specify a bot/user Github acccount that you do have access to with the `FORK` parameter.

A fork of each target repository will be created on this account, and all changes will be pushed to a branch on the fork, instead of upstream. Pull requests will be opened from the forks to target repositories.

Note: while you can open pull requests to target repositories without write access, some features, like applying labels, are not possible.

```yml
uses: webitel/reusable-workflows/actions/file-sync@file-sync-v3
with:
    GH_PAT: ${{ secrets.GH_PAT }}
    FORK: file-sync-bot
```

## 💻 Development

Issues and PRs are very welcome!

The actual source code of this library is in the `src` folder.

- run `yarn lint` or `npm run lint` to run eslint.
- run `yarn start` or `npm run start` to run the Action locally.
- run `yarn build` or `npm run build` to produce a production version of [file-sync](https://github.com/webitel/reusable-workflows/tree/main/actions/file-sync) in the `dist` folder.
