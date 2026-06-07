---
name: solve-github-issue
description: Read and solve GitHub issues thoroughly, including all comments. Use when the user asks to work on issues, fix issues, or solve issues from GitHub.
---

# Solve GitHub Issue

## Workflow

### 1. List and select issues

```bash
gh issue list --repo <owner/repo> --state open
```

If the user specifies an issue number, skip to step 2 with that number.

### 2. Read the FULL issue — body AND comments

**Mandatory.** Never skip comments. They contain context, failed approaches, root cause analysis, and domain knowledge that the issue body alone does not have.

```bash
gh issue view <number> --repo <owner/repo> --json title,body,labels,assignees,milestone
```

Then read ALL comments:

```bash
gh issue view <number> --repo <owner/repo> --comments
```

Or via API for structured output:

```bash
gh api repos/<owner/repo>/issues/<number>/comments --jq '.[].body'
```

### 3. Check linked items

- Linked PRs (previous attempts)
- Related issues mentioned in body or comments
- Cross-references (`#123` mentions)

```bash
gh api repos/<owner/repo>/issues/<number>/timeline --jq '.[] | select(.event == "cross-referenced" or .event == "referenced") | .source.issue.html_url // .commit_id'
```

### 4. Investigate and fix

- Use all gathered context (body + comments + linked items) to understand the problem
- Comments often contain root cause analysis, stack traces, or hints from prior debugging
- If a comment says "this approach won't work because X" — respect that knowledge

### 5. Close with evidence

```bash
gh issue close <number> --repo <owner/repo> --comment "Fixed in <sha>. <brief summary>."
```

## Checklist

- [ ] Read issue body (title, description, labels, steps to reproduce)
- [ ] Read ALL comments on the issue
- [ ] Check linked PRs and related issues
- [ ] Implement fix using full context
- [ ] Close issue with commit reference
