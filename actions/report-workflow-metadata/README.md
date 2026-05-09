# Report Workflow Metadata Action

Reports release metadata from a GitHub Actions workflow to github-dashboard:

```text
POST https://dev.webitel.com/api/workflow-metadata
```

The action requests a GitHub Actions OIDC token and sends only the metadata
fields accepted by the server: `sha`, `version`, and `release_line`. Repository,
workflow run id, and run attempt are taken by the server from the validated OIDC
claims.

Reporting is best-effort. If token retrieval or the callback fails, the action
emits a GitHub Actions warning and lets the workflow continue.

## Usage

The job must allow OIDC tokens:

```yaml
permissions:
  contents: read
  id-token: write
```

Example:

```yaml
- name: Report workflow metadata
  uses: webitel/reusable-workflows/actions/report-workflow-metadata@v2
  with:
    sha: ${{ github.sha }}
    version: ${{ steps.version.outputs.version }}
    release-line: ${{ steps.version.outputs.version }}
```

## Inputs

| Name | Required | Default | Description |
|---|---:|---|---|
| `sha` | yes | | Commit SHA observed by the workflow. |
| `version` | yes | | Calculated release version. |
| `release-line` | no | `version` | Release line reported to the dashboard. |
| `endpoint-url` | no | `https://dev.webitel.com/api/workflow-metadata` | Metadata callback endpoint. |
| `audience` | no | `https://dev.webitel.com` | Audience requested for the OIDC token. |
| `retries` | no | `2` | Retries for transient callback failures. |
| `timeout-ms` | no | `5000` | Per-request timeout in milliseconds. |
| `retry-delay-ms` | no | `1000` | Delay between retry attempts in milliseconds. |

## Notes

- Do not pass `run_id`, `run_attempt`, `repository`, or Jira keys in the body.
- Transient callback responses are `408`, `429`, and `5xx`.
- Non-transient `4xx` responses are logged as warnings and are not retried.
