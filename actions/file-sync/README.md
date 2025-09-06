<div align="center">

# Repo File Sync Action

Keep files like Action workflows or entire directories in sync between multiple repositories.

</div>

## 👋 Introduction

With [file-sync-action](https://github.com/webitel/reusable-workflows/actions/file-sync-action) you can sync files, like workflow `.yml` files, configuration files or whole directories between repositories or branches. It works by running a GitHub Action in your main repository everytime you push something to that repo. The action will use a `sync.yml` config file to figure out which files it should sync where. If it finds a file which is out of sync it will open a pull request in the target repository with the changes.

## 🚀 Features

- Keep GitHub Actions workflow files in sync across all your repositories
- Sync any file or a whole directory to as many repositories as you want
- Easy configuration for any use case
- Create a pull request in the target repo so you have the last say on what gets merged
- Automatically label pull requests to integrate with other actions like [automerge-action](https://github.com/pascalgn/automerge-action)
- Assign users to the pull request
- Render [Jinja](https://jinja.palletsprojects.com/)-style templates as use variables thanks to [Nunjucks](https://mozilla.github.io/nunjucks/)

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
        uses: actions/checkout@main
      
      - name: Run GitHub File Sync
        uses: webitel/reusable-workflows/actions/file-sync-action@v1
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

The last step is to create a `.yml` file in the `.github` folder of your repository and specify what file(s) to sync to which repositories:

**.github/sync.yml**

```yml
user/repository:
  - .github/workflows/test.yml
  - .github/workflows/lint.yml

user/repository2:
  - source: workflows/stale.yml
    dest: .github/workflows/stale.yml
```

More info on how to specify what files to sync where [below](#%EF%B8%8F-sync-configuration).

### YAML anchors via `definitions` (advanced)

If you want to avoid repeating the same file lists, you can use YAML anchors and aliases. You can declare your anchors under a top-level `definitions` key. The action will ignore the `definitions` key when parsing, so it won’t be treated as a repo name or a group.

Example (anchors used with direct repo entries):

```yml
# .github/sync.yml

definitions:
  common_files: &common_files
    - .github/workflows/test.yml
    - source: workflows/stale.yml
      dest: .github/workflows/stale.yml

user/repository: *common_files
user/repository2: *common_files
```

Example (anchors used with groups):

```yml
# .github/sync.yml

definitions:
  group_files: &group_files
    - .github/workflows/lint.yml
    - source: workflows/stale.yml
      dest: .github/workflows/stale.yml

group:
  - repos: |
      user/repo1
      user/repo2
    files: *group_files
```

This feature relies on standard YAML anchor/alias behavior and is supported by the configuration parser. Use it to keep your sync configuration DRY while retaining full readability.

## ⚙️ Action Inputs

Here are all the inputs [file-sync-action](https://github.com/webitel/reusable-workflows/actions/file-sync-action) takes:

| Key                       | Value                                                                                                                                          | Required                                         | Default                        |
|---------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|--------------------------------|
| `GH_PAT`                  | Your [Personal Access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) | **`GH_PAT` or `GH_INSTALLATION_TOKEN` required** | N/A                            |
| `GH_INSTALLATION_TOKEN`   | Token from a GitHub App installation                                                                                                           | **`GH_PAT` or `GH_INSTALLATION_TOKEN` required** | N/A                            |
| `CONFIG_PATH`             | Path to the sync configuration file                                                                                                            | **No**                                           | .github/sync.yml               |
| `IS_FINE_GRAINED`         | Labels the GH_PAT as a fine grained token                                                                                                      | **No**                                           | false                          |
| `PR_LABELS`               | Labels which will be added to the pull request. Set to false to turn off                                                                       | **No**                                           | sync                           |
| `ASSIGNEES`               | Users to assign to the pull request                                                                                                            | **No**                                           | N/A                            |
| `REVIEWERS`               | Users to request a review of the pull request from                                                                                             | **No**                                           | N/A                            |
| `TEAM_REVIEWERS`          | Teams to request a review of the pull request from                                                                                             | **No**                                           | N/A                            |
| `COMMIT_PREFIX`           | Prefix for commit message and pull request title                                                                                               | **No**                                           | 🔄                             |
| `COMMIT_BODY`             | Commit message body. Will be appended to commit message, separated by two line returns.                                                        | **No**                                           | ''                             |
| `PR_BODY`                 | Additional content to add in the PR description.                                                                                               | **No**                                           | ''                             |
| `ORIGINAL_MESSAGE`        | Use original commit message instead. Only works if the file(s) were changed and the action was triggered by pushing a single commit.           | **No**                                           | false                          |
| `COMMIT_AS_PR_TITLE`      | Use first line of the commit message as PR title. Only works if `ORIGINAL_MESSAGE` is `true` and working.                                      | **No**                                           | false                          |
| `COMMIT_EACH_FILE`        | Commit each file seperately                                                                                                                    | **No**                                           | true                           |
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

The action sets the `pull_request_urls` output to the URLs of any created Pull Requests. It will be an array of URLs to each PR, e.g. `'["https://github.com/username/repository/pull/number", "..."]'`.

## 🛠️ Sync Configuration

To tell [file-sync-action](https://github.com/webitel/reusable-workflows/actions/file-sync-action) what files to sync where, you have to create a `sync.yml` file in the `.github` directory of your main repository (see [action-inputs](#%EF%B8%8F-action-inputs) on how to change the location).

The top-level key should be used to specify the target repository in the format `username`/`repository-name`@`branch`, after that you can list all the files you want to sync to that individual repository:

```yml
user/repo:
  - path/to/file.txt
user/repo2@develop:
  - path/to/file2.txt
```

There are multiple ways to specify which files to sync to each individual repository.

### List individual file(s)

The easiest way to sync files is the list them on a new line for each repository:

```yml
user/repo:
  - .github/workflows/build.yml
  - LICENSE
  - .gitignore
```

### Different destination path/filename(s)

Using the `dest` option you can specify a destination path in the target repo and/or change the filename for each source file:

```yml
user/repo:
  - source: workflows/build.yml
    dest: .github/workflows/build.yml
  - source: LICENSE.md
    dest: LICENSE
```

### Sync entire directories

You can also specify entire directories to sync:

```yml
user/repo:
  - source: workflows/
    dest: .github/workflows/
```

### Exclude certain files when syncing directories

Using the `exclude` key you can specify files you want to exclude when syncing entire directories (#26).

```yml
user/repo:
  - source: workflows/
    dest: .github/workflows/
    exclude: |
      node.yml
      lint.yml
```

> **Note:** the exclude file path is relative to the source path

### Don't replace existing file(s)

By default if a file already exists in the target repository, it will be replaced. You can change this behaviour by setting the `replace` option to `false`:

```yml
user/repo:
  - source: .github/workflows/lint.yml
    replace: false
```

### Using templates

#### Custom Nunjucks delimiters (optional)
If your source files contain characters that conflict with the default Nunjucks tags, you can customize the delimiter syntax via inputs. Set any of the following inputs in the workflow step that uses the action:

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync-action@v1
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    # Example: use ((* *)) for blocks, ((( ))) for variables, ((= =)) for comments
    NUNJUCKS_BLOCK_START: '((*'
    NUNJUCKS_BLOCK_END: '*))'
    NUNJUCKS_VARIABLE_START: '((('
    NUNJUCKS_VARIABLE_END: ')))'
    NUNJUCKS_COMMENT_START: '((='
    NUNJUCKS_COMMENT_END: '=))'
```

Defaults (when not provided) remain the standard Nunjucks tags: `{% %}` for blocks, `{{ }}` for variables, and `{# #}` for comments.

You can render templates before syncing by using the [Jinja](https://jinja.palletsprojects.com/)-style template syntax. It will be compiled using [Nunjucks](https://mozilla.github.io/nunjucks/) and the output written to the specific file(s) or folder(s).

Nunjucks supports variables and blocks among other things. To enable, set the `template` field to a context dictionary, or in case of no variables, `true`:

```yml
user/repo:
  - source: src/README.md
    template:
      user:
        name: 'Webitel'
        handle: '@webitel'
```

In the source file you can then use these variables like this:

```yml
# README.md

Created by {{ user.name }} ({{ user.handle }})
```

Result:

```yml
# README.md

Created by Webitel (@webitel)
```

You can also use `extends` with a relative path to inherit other templates. Take a look at Nunjucks [template syntax](https://mozilla.github.io/nunjucks/templating.html) for more info.

```yml
user/repo:
  - source: .github/workflows/child.yml
    template: true
```

```yml
# child.yml
{% extends './parent.yml' %}

{% block some_block %}
This is some content
{% endblock %}
```

### Delete orphaned files

With the `deleteOrphaned` option you can choose to delete files in the target repository if they are deleted in the source repository. The option defaults to `false` and only works when [syncing entire directories](#sync-entire-directories):

```yml
user/repo:
  - source: workflows/
    dest: .github/workflows/
    deleteOrphaned: true
```

It only takes effect on that specific directory.

### Sync the same files to multiple repositories

Instead of repeating yourself listing the same files for multiple repositories, you can create a group:

```yml
group:
  repos: |
    user/repo
    user/repo1
  files: 
    - source: workflows/build.yml
      dest: .github/workflows/build.yml
    - source: LICENSE.md
      dest: LICENSE
```

You can create multiple groups like this:

```yml
group:
  # first group
  - files:
      - source: workflows/build.yml
        dest: .github/workflows/build.yml
      - source: LICENSE.md
        dest: LICENSE
    repos: |
      user/repo1
      user/repo2

  # second group
  - files: 
      - source: configs/dependabot.yml
        dest: .github/dependabot.yml
    repos: |
      user/repo3
      user/repo4
```

### Syncing branches

You can also sync different branches from the same or different repositories (#51). For example, a repository named `foo/bar` with branch `main`, and `sync.yml` contents:

```yml
group:
  repos: |
    foo/bar@de
    foo/bar@es
    foo/bar@fr
  files:
    - source: .github/workflows/
      dest: .github/workflows/
```

Here all files in `.github/workflows/` will be synced from the `main` branch to the branches `de`/`es`/`fr`.

## 📖 Examples

Here are a few examples to help you get started!

### Basic Example

**.github/sync.yml**

```yml
user/repository:
  - LICENSE
  - .gitignore
```

### Sync all workflow files

This example will keep all your `.github/workflows` files in sync across multiple repositories:

**.github/sync.yml**

```yml
group:
  repos: |
    user/repo1
    user/repo2
  files:
    - source: .github/workflows/
      dest: .github/workflows/
```

### Custom labels

By default [repo-file-sync-action](https://github.com/webitel/reusable-workflows/actions/file-sync-action) will add the `sync` label to every PR it creates. You can turn this off by setting `PR_LABELS` to false, or specify your own labels:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync-action@v1
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    PR_LABELS: |
      file-sync
      automerge
```

### Assign a user to the PR

You can tell [repo-file-sync-action](https://github.com/webitel/reusable-workflows/actions/file-sync-action) to assign users to the PR with `ASSIGNEES`:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync-action@v1
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    ASSIGNEES: user
```

### Request a PR review

You can tell [repo-file-sync-action](https://github.com/webitel/reusable-workflows/actions/file-sync-action) to request a review of the PR from users with `REVIEWERS` and from teams with `TEAM_REVIEWERS`:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync-action@v1
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    REVIEWERS: |
      user1

    TEAM_REVIEWERS: engineering
```

### Custom GitHub Enterprise Host

If your target repository is hosted on a GitHub Enterprise Server you can specify a custom host name like this:

**.github/workflows/sync.yml**

```yml
https://custom.host/user/repo:
  - path/to/file.txt

# or in a group

group:
  - files:
      - source: path/to/file.txt
        dest: path/to/file.txt
    repos: |
      https://custom.host/user/repo
```

> **Note:** The key has to start with http to indicate that you want to use a custom host.

### Different branch prefix

By default all new branches created in the target repo will be in the this format: `repo-sync/SOURCE_REPO_NAME/SOURCE_BRANCH_NAME`, with the SOURCE_REPO_NAME being replaced with the name of the source repo and SOURCE_BRANCH_NAME with the name of the source branch.

If your repo name contains invalid characters, like a dot ([#32](https://github.com/webitel/reusable-workflows/actions/file-sync-action/issues/32)), you can specify a different prefix for the branch (the text before `/SOURCE_BRANCH_NAME`):

**.github/workflows/sync.yml**

```yml
uses: webitel/reusable-workflows/actions/file-sync-action@v1
with:
    GH_PAT: ${{ secrets.GH_PAT }}
    BRANCH_PREFIX: custom-branch
```

The new branch will then be `custom-branch/SOURCE_BRANCH_NAME`.

> You can use `SOURCE_REPO_NAME` in your custom branch prefix as well and it will be replaced with the actual repo name

### Custom commit body

You can specify a custom commit body. This will be appended to the commit message, separated by two new lines. For example:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync-action@v1
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    COMMIT_BODY: "Change-type: patch"
```

The above example would result in a commit message that looks something like this:
```
🔄 synced local '<filename>' with remote '<filename>'

Change-type: patch
```

### Add content to the PR body

You can add more content to the PR body with the `PR_BODY` option. For example:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: webitel/reusable-workflows/actions/file-sync-action@v1
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    PR_BODY: This is your custom PR Body
```

It will be added below the first line of the body and above the list of changed files. The above example would result in a PR body that looks something like this:

```
synced local file(s) with GITHUB_REPOSITORY.

This is your custom PR Body

▶ Changed files

---

This PR was created automatically by the file-sync-action workflow run xxx.
```

### Fork and pull request workflow

If you do not wish to grant this action write access to target repositories, you can specify a bot/user Github acccount that you do have access to with the `FORK` parameter.

A fork of each target repository will be created on this account, and all changes will be pushed to a branch on the fork, instead of upstream. Pull requests will be opened from the forks to target repositories.

Note: while you can open pull requests to target repositories without write access, some features, like applying labels, are not possible.

```yml
uses: webitel/reusable-workflows/actions/file-sync-action@v1
with:
    GH_PAT: ${{ secrets.GH_PAT }}
    FORK: file-sync-bot
```

## 💻 Development

Issues and PRs are very welcome!

The actual source code of this library is in the `src` folder.

- run `yarn lint` or `npm run lint` to run eslint.
- run `yarn start` or `npm run start` to run the Action locally.
- run `yarn build` or `npm run build` to produce a production version of [file-sync-action](https://github.com/webitel/reusable-workflows/actions/file-sync-action) in the `dist` folder.
