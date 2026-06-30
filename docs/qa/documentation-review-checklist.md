# Documentation Review Checklist

Use this checklist when reviewing documentation changes.

## Content Quality

- [ ] All claims about product behavior are verifiable in the codebase or live app
- [ ] Implementation status is clearly marked (Implemented, Partially Implemented, Planned, etc.)
- [ ] Known risks, limitations, and open questions are documented
- [ ] No unsupported "production-ready" claims without evidence
- [ ] Feature acceptance criteria are testable

## Structure

- [ ] Section README.md files exist for all documentation directories
- [ ] Reader paths in DOCUMENTATION_INDEX.md are accurate
- [ ] Feature docs follow the standard template
- [ ] Broken links checked and fixed
- [ ] New docs registered in DOCUMENTATION_INDEX.md

## Formatting

- [ ] Mermaid diagrams render correctly (check in GitHub preview)
- [ ] Tables are properly aligned
- [ ] GitHub alerts (`[!NOTE]`, `[!WARNING]`, etc.) used appropriately
- [ ] Code blocks specify language for syntax highlighting
- [ ] Relative links use correct paths

## Safety

- [ ] No secrets exposed (API keys, passwords, tokens, private keys)
- [ ] No production configuration values exposed
- [ ] No database connection strings or credentials visible
- [ ] No environment-specific URLs that should remain internal

## Accuracy

- [ ] Role names use canonical forms (not legacy aliases)
- [ ] API routes reflect current implementation
- [ ] Database table/column names match schema
- [ ] Env variable names match `.env.example`

## Validation Commands

```bash
# Check for broken internal links
find docs -name "*.md" -exec grep -oP '\[.*?\]\(\.\.?/[^)]+\)' {} \; | while read link; do echo "$link"; done

# Check for secrets in docs
grep -RInE "api[_-]?key|secret|password|token|private key|BEGIN RSA|BEGIN PRIVATE" docs/ README.md DOCUMENTATION_INDEX.md || echo "No secrets found"

# Count documentation files
find docs -name "*.md" | wc -l
```
