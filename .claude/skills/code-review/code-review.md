---
name: code-review
description: Review a PR thoroughly before merging. Produce a clear PR description (What/Why/Changes) and a structured review with blocking issues, suggestions, and a test plan.
---

## Goal

Ensure the change is correct, safe, maintainable, test-covered, and ready to merge.
Always provide actionable feedback with file references and concrete suggestions.

## Inputs

- PR diff (preferred) or branch to review
- PR title (if available)
- Any context the author provides (why, requirements, related issue)

If context is missing, infer intent from the diff and ask the smallest number of questions (only if truly necessary).

---

## Workflow

### 1) Understand intent (from PR title/description or diff)
- What is the feature/fix?
- Who/what does it affect?
- What are the success criteria?
- Any constraints (backward compatibility, performance, security)?

### 2) Inspect changes
Run:

1. `git diff main...HEAD` (full diff)
2. `git diff --stat main...HEAD` (summary)
3. `git log --oneline main..HEAD` (commit intent, optional)

If renames/deletes are likely, also run:
- `git diff --name-status main...HEAD`

### 3) Draft/Improve the PR description
Write a PR description **exactly** in this format:

## What
One sentence explaining what this PR does.

## Why
Brief context on why this change is needed.

## Changes
- Bullet points of specific changes made
- Group related changes together
- Mention any files deleted or renamed

If the PR already has a description, rewrite it to be clearer and more specific (without changing meaning).

### 4) Review with a checklist mindset
Check each category below and note findings:

#### Correctness & Logic
- Does it do what it claims?
- Edge cases handled? (null/empty, boundaries, timezones, off-by-one, concurrency, retries)
- Avoids regressions? Avoids breaking public APIs?

#### Code Quality
- Naming clarity, readability, consistent style
- Functions/classes are appropriately sized and cohesive
- Avoid duplicated logic; consider reuse only when it reduces complexity
- Comments explain *why* (not what) when needed

#### Tests
- Tests added/updated for new behavior and bug fixes
- Tests cover failure paths and edge cases
- No flaky patterns (timing, randomness without seeding, network reliance unless mocked)
- If no tests: call it out and recommend minimum test additions

#### Security & Safety
- Input validation/sanitization where applicable
- No secrets committed; no logging sensitive data
- Avoid unsafe deserialization / injection risks (SQL, shell, template, HTML)
- Dependencies updated with care; note known risk areas

#### Performance & Reliability
- Avoid unnecessary loops, N+1 queries, repeated heavy work
- Caching and memoization used correctly (no stale data bugs)
- Reasonable timeouts/retries for I/O
- Memory usage not accidentally increased

#### API/UX/Behavior Changes
- Backward compatibility and migrations (if needed)
- Error messages are helpful and consistent
- Observability: logging/metrics where appropriate (without noise)

#### Documentation & Maintainability
- README / docs updated if behavior or usage changed
- Config changes documented
- Deprecations clearly communicated

### 5) Run checks (when possible)
If you have access to run commands, do the best available set:

General:
- `git status`
- `git diff main...HEAD`
- `git grep -n "TODO\|FIXME\|HACK" -- .` (optional)

Language/tooling (pick what matches the repo):
- JS/TS: `npm test` / `pnpm test`, `npm run lint`, `npm run typecheck`
- Python: `pytest`, `ruff`, `black --check`, `mypy`
- Go: `go test ./...`, `golangci-lint run`
- Java: `mvn test` / `gradle test`
- Rust: `cargo test`, `cargo clippy`

If you cannot run tests, clearly state: **“Not executed (no runtime access). Recommend author runs: …”**

---

## Output Format (always use this structure)

### PR Description (ready to paste)

## What
...

## Why
...

## Changes
- ...
- ...

---

### Review Summary
**Verdict:** ✅ Approve / ⚠️ Request Changes / 💬 Comment-only  
**Risk level:** Low / Medium / High (explain in 1–2 lines)

#### ✅ What looks good
- Bullet list of strengths (correctness, clarity, test coverage, etc.)

#### ⛔ Blocking issues (must fix before merge)
Numbered list. For each item include:
- **Where:** `path/to/file.ext` (+ function/class name if possible)
- **Problem:** what’s wrong and why it matters
- **Fix:** specific recommendation (include snippet if short)

If there are none, write: “None found.”

#### 🛠️ Non-blocking suggestions (improvements / refactors / nits)
- Short bullets, grouped by theme (readability, tests, naming, etc.)

#### ❓ Questions / Assumptions
- Ask only what’s necessary to ensure correctness

#### 🧪 Test Plan
- **Executed:** list commands run and results (or “Not executed”)
- **Recommended:** additional tests or manual checks to reduce risk

#### 📌 Merge Checklist
- [ ] PR description matches intent and mentions renames/deletes
- [ ] Tests added/updated and passing
- [ ] No secrets or sensitive logs
- [ ] Docs updated if behavior/usage changed
- [ ] Backward compatibility considered
- [ ] Error handling and edge cases covered

---

## Tone & Style Rules

- Be direct, respectful, and specific.
- Prefer “Here’s what I’d change and why” over vague criticism.
- Reference concrete code locations (file + function).
- Separate **blocking** vs **non-blocking** feedback.
- If you suggest a change, include an example or a minimal patch-like snippet when possible.

## Common Review Red Flags (call these out explicitly)

- Silent behavior changes with no tests
- Broad refactors mixed with functional changes (recommend splitting)
- Unhandled errors / swallowed exceptions
- Breaking API changes without migration path
- Logging sensitive data
- Timezone/date parsing issues
- Race conditions in async/concurrent code