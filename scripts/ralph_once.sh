#!/bin/bash
#
# ralph_once.sh — one tick of an autonomous TDD loop
#
# Picks the lowest-numbered open `needs-triage` issue whose blockers are all
# closed and asks Claude Code to implement it via strict TDD.
#
# Designed to be called from cron. Concurrent runs are prevented by a flock(1)
# lockfile so a long tick won't overlap with the next cron firing.

set -euo pipefail

REPO_ROOT="/root/QC-Manager"
GH_REPO="Gebrilo/QC-Manager"
LOCKFILE="/tmp/ralph_once.lock"
LOG_DIR="/root/.claude/logs"
LOG_FILE="${LOG_DIR}/ralph.log"

mkdir -p "${LOG_DIR}"

# Acquire an exclusive non-blocking lock; bail if another tick is running.
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
    echo "[$(date -Is)] another ralph tick is running; skipping" >> "${LOG_FILE}"
    exit 0
fi

cd "${REPO_ROOT}"

{
    echo "============================================================"
    echo "[$(date -Is)] ralph tick start — branch=$(git rev-parse --abbrev-ref HEAD)"
    echo "============================================================"
} >> "${LOG_FILE}"

GIT_CONTEXT=$(git log -n 5 --oneline)

ISSUES_CONTEXT=$(gh issue list \
    --repo "${GH_REPO}" \
    --label needs-triage \
    --state open \
    --json number,title,body \
    --jq 'sort_by(.number) | .[] | "## #\(.number): \(.title)\n\n\(.body)\n"')

if [[ -z "${ISSUES_CONTEXT}" ]]; then
    echo "[$(date -Is)] no open needs-triage issues; nothing to do" >> "${LOG_FILE}"
    exit 0
fi

PROMPT="Using this codebase state:
${GIT_CONTEXT}

And these open issues:
${ISSUES_CONTEXT}

Pick the lowest-numbered issue whose 'Blocked by' references are all closed (or 'None - can start immediately'). Implement it using strict TDD: write a failing test first, make it pass, then run the project's typecheck and test commands. When the issue is fully complete and all tests + typecheck pass, comment on the GitHub issue with a summary of the changes and close the issue using \`gh issue close <number> --comment ...\`. If you cannot make a test pass within reasonable bounds, leave the issue open and comment with what you tried and what's blocking."

ALLOWED_TOOLS=(
    "Edit" "Write" "MultiEdit"
    "Bash(npm test*)" "Bash(npm run *)" "Bash(npm install*)" "Bash(npm ci*)"
    "Bash(npx jest*)" "Bash(jest*)" "Bash(node *)"
    "Bash(git log*)" "Bash(git status*)" "Bash(git diff*)"
    "Bash(git add *)" "Bash(git commit *)" "Bash(git push*)"
    "Bash(git checkout *)" "Bash(git branch*)" "Bash(git stash*)"
    "Bash(gh issue *)" "Bash(gh pr *)"
    "Bash(ls *)" "Bash(cat *)" "Bash(grep *)" "Bash(find *)"
)

printf '%s' "${PROMPT}" | claude --print \
    --permission-mode acceptEdits \
    --allowed-tools "${ALLOWED_TOOLS[*]}" \
    >> "${LOG_FILE}" 2>&1 || {
    rc=$?
    echo "[$(date -Is)] claude exited with rc=${rc}" >> "${LOG_FILE}"
    exit "${rc}"
}

echo "[$(date -Is)] ralph tick complete" >> "${LOG_FILE}"
