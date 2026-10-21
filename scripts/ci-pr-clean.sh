#!/usr/bin/env bash
set -euo pipefail
read -r cinema_node_major < .node-version
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "$cinema_node_major" ]]; then
  echo "Use Node $cinema_node_major, matching .github/workflows/ci.yml and .node-version." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit the intended changes before running clean PR validation.' >&2
  exit 1
fi
git fetch origin main
cinema_ci_dir=$(mktemp -d "${TMPDIR:-/tmp}/cinema-ci.XXXXXX")
cleanup() {
  git worktree remove --force "$cinema_ci_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT
git worktree add --detach "$cinema_ci_dir" HEAD
# This temporary merge only simulates GitHub's merge commit; it is never pushed.
git -c commit.gpgsign=false -C "$cinema_ci_dir" merge --no-edit origin/main
(cd "$cinema_ci_dir" && npm ci && npm run ci:pr)
