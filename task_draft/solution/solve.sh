#!/bin/bash
# Reference solution: applies patch.diff (paths are relative to the repo root /app).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd /app
git apply --whitespace=nowarn "$DIR/patch.diff"
