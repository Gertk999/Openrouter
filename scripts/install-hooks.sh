#!/bin/bash
# One-time setup: symlinks scripts/pre-commit into .git/hooks so `git commit`
# runs the Jest test suite automatically. Run this once after cloning the repo:
#   bash scripts/install-hooks.sh
set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
ln -sf "../../scripts/pre-commit" "$REPO_ROOT/.git/hooks/pre-commit"
chmod +x "$REPO_ROOT/scripts/pre-commit"
echo "Installed pre-commit hook -> runs 'npx jest' on every commit."
