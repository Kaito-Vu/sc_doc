#!/usr/bin/env bash
# Fork guard: how many lines outside ee/ differ from a base ref.
# Usage: scripts/core-diff-budget.sh [base-ref=main] [max-lines=40]
set -euo pipefail
base="${1:-main}"; max="${2:-40}"
total=$(git diff --numstat "$base"...HEAD -- . ':(exclude)**/ee/**' ':(exclude)docs/**' ':(exclude)scripts/**' \
  | awk '{a+=$1; d+=$2} END{print a+d+0}')
git diff --numstat "$base"...HEAD -- . ':(exclude)**/ee/**' ':(exclude)docs/**' ':(exclude)scripts/**'
echo "core lines changed vs $base: $total (budget $max)"
[ "$total" -le "$max" ]
