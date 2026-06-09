# Bug Reporting — Full-App Audit

The contract for filing audit findings as GitHub issues.

## Title format

```
[audit][<type>][<page>] <one-line summary>
```

- `<type>` ∈ { `bug`, `ux`, `enh` }
- `<page>` is the spec file slug (the filename under `pages/` without `.md`)
- `<one-line summary>` is imperative-mood, < 80 chars, no trailing period

Examples:
- `[audit][bug][bugs] Status filter resets to "All" on page reload`
- `[audit][ux][dashboard] Empty state shows raw "null" instead of placeholder`

## Labels (every audit issue gets all five groups)

| Group | Allowed values | Required? |
| --- | --- | --- |
| `source` | `audit` (literally this one label) | Yes — always |
| `type` | `type:bug`, `type:ux`, `type:enhancement` | Yes — exactly one |
| `severity` | `severity:critical`, `severity:high`, `severity:medium`, `severity:low` | Yes — exactly one |
| `page` | `page:<slug>` matching the spec file name | Yes — exactly one |
| `area` | `area:web`, `area:api`, `area:data` | Yes — exactly one |

If a `page:<slug>` label doesn't yet exist:
```bash
gh label create "page:<slug>" --color BFD4F2 --description "Audit finding on the <slug> page"
```

## Severity rubric

| Level | Definition | Examples |
| --- | --- | --- |
| `critical` | Blocks core workflow, data loss, security, or production-breaking | Login broken; save action silently drops data; API 500 on a main page |
| `high` | Workflow degraded; user can finish but with friction or wrong data shown | Filter doesn't apply; summary card shows wrong count; action requires page refresh to take effect |
| `medium` | UX issue or minor functional bug with workaround | Empty state ugly; button label confusing; toast disappears too fast |
| `low` | Polish, enhancement, cosmetic | Misalignment; copy nit; missing tooltip |

When in doubt, pick the lower severity.

## Body template

```markdown
## Summary
<one paragraph: what's wrong>

## Steps to reproduce
1. Logged in as admin
2. Navigate to <route>
3. <action>
4. <observation>

## Expected
<copy the Expected line from the spec file>

## Actual
<what happened, including any console errors / network failures>

## Spec reference
- Pack: `docs/05-qa/full-app-audit/pages/<page>.md`
- Section: `<exact heading from that spec file>`

## Evidence
- Screenshot: <inline GitHub attachment>
- Console excerpt (if any):
  ```
  <copy/paste>
  ```

## Environment
- URL: https://gebrils.cloud
- Browser: Chromium (Browserbase)
- Audit run: `docs/05-qa/full-app-audit/runs/<run-file>.md`
```

## Dedup rule (run before every `gh issue create`)

```bash
gh issue list --state open \
  --search "[audit][<type>][<page>] <keyword>" \
  --json number,title
```

- **Exact title match or near-match:** do **not** create a new issue. Instead comment with "Still reproducing on YYYY-MM-DD" plus fresh evidence.
- **No match:** create the issue.

## When in doubt: don't file

A finding has to be reproducible and meaningfully wrong. If you can't reproduce it twice, surface it in the per-run report under "Notes — needs human eyes" rather than filing an ambiguous issue.
