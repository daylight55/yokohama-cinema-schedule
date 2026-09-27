#!/usr/bin/env bash
set -euo pipefail
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
git -C "$cinema_ci_dir" merge --no-edit origin/main
(cd "$cinema_ci_dir" && npm ci && npm run ci:pr)
