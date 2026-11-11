#!/bin/bash
# Hidden verifier for "Migrate the Spaces pages into tool_znak_fe".
# Reward is 1 only if every gating check passes, otherwise 0.
set -u

APP=/app/tool_znak_fe
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS=/logs/verifier
mkdir -p "$LOGS"
: > "$LOGS/summary.txt"
FAILED=0

check() { # check <name> <command...>
  local name="$1"; shift
  if timeout "${CHECK_TIMEOUT:-150}" "$@" >"$LOGS/$name.log" 2>&1; then
    echo "PASS $name" | tee -a "$LOGS/summary.txt"
  else
    echo "FAIL $name (see $name.log)" | tee -a "$LOGS/summary.txt"
    tail -n 40 "$LOGS/$name.log"
    FAILED=1
  fi
}

finish() {
  if [ "$FAILED" -eq 0 ]; then echo 1 > "$LOGS/reward.txt"; else echo 0 > "$LOGS/reward.txt"; fi
  echo "reward=$(cat "$LOGS/reward.txt")"
  exit 0
}

cd /app || { FAILED=1; finish; }

changed_src() { # changed or new source files in the target (excluding tests the agent wrote is NOT done: they count)
  { git diff --name-only v0.1.0-init -- tool_znak_fe/src; git ls-files -o --exclude-standard -- tool_znak_fe/src; } | sort -u | grep -E '\.(ts|tsx)$' || true
}

# 1. The source repo must be untouched.
check source_untouched bash -c '[ -z "$(git status --porcelain -- gen_img_fe)" ] && git diff --quiet v0.1.0-init -- gen_img_fe'

# 2. No new dependencies.
check deps_unchanged git diff --quiet v0.1.0-init -- tool_znak_fe/package.json tool_znak_fe/package-lock.json

# 3. Required files exist.
check files_exist bash -c '[ -f "'"$APP"'/src/app/(app)/spaces-list/page.tsx" ] && [ -f "'"$APP"'/src/app/(app)/spaces/page.tsx" ] && [ -f "'"$APP"'/src/lib/api/spaces.ts" ]'

# 4. No stack leakage from the source app.
check no_source_stack bash -c '
  files=$(cd /app && { git diff --name-only v0.1.0-init -- tool_znak_fe/src; git ls-files -o --exclude-standard -- tool_znak_fe/src; } | sort -u | grep -E "\.(ts|tsx)$" | grep -v "\.test\." || true)
  [ -z "$files" ] && exit 0
  ! grep -nE "from [\"'"'"'](lucide-react|next-intl|react-redux|axios)[\"'"'"']|useTranslations|useAxiosRequest|axiosRequest" $files
'

cd "$APP" || { FAILED=1; finish; }

# 5. Type check.
CHECK_TIMEOUT=300 check tsc npx --no-install tsc --noEmit

# 6. Lint the files the agent touched.
FILES=$(cd /app && changed_src | sed 's#^tool_znak_fe/##')
if [ -n "$FILES" ]; then
  # shellcheck disable=SC2086
  check eslint npx --no-install eslint $FILES
fi

# 7. Tests the agent wrote (new/changed *.test.* files). The full existing suite is
#    deliberately NOT run: it takes minutes and one slow file would burn the verifier budget.
AGENT_TESTS=$(cd /app && changed_src | grep -E '\.test\.tsx?$' | sed 's#^tool_znak_fe/##')
if [ -n "$AGENT_TESTS" ]; then
  # shellcheck disable=SC2086
  CHECK_TIMEOUT=240 check agent_tests npx --no-install vitest run $AGENT_TESTS
fi

# 7b. Existing tests of the layers the task touches (API client, BFF path rules). Fast, and a regression here
#     (e.g. a changed request helper) must fail the task.
CHECK_TIMEOUT=240 check existing_lib_tests npx --no-install vitest run --testTimeout=30000 src/lib

# 8. Hidden behaviour tests (copied in only now, so the agent never sees them).
HID="$APP/src/__hidden__"
rm -rf "$HID"; mkdir -p "$HID"
cp "$TESTS_DIR"/spaces-*.ts "$TESTS_DIR"/spaces-*.tsx "$HID"/
check hidden_behaviour npx --no-install vitest run --testTimeout=30000 src/__hidden__/spaces-list.hidden.test.tsx
CHECK_TIMEOUT=240 check hidden_canvas npx --no-install vitest run --testTimeout=30000 src/__hidden__/spaces-canvas.hidden.test.tsx
check hidden_bff npx --no-install vitest run --testTimeout=30000 src/__hidden__/spaces-bff.hidden.test.ts
check hidden_nav npx --no-install vitest run --testTimeout=30000 src/__hidden__/spaces-nav.hidden.test.tsx
for L in en ru zh; do
  check "hidden_i18n_$L" env TEST_LANG=$L npx --no-install vitest run --testTimeout=30000 src/__hidden__/spaces-list.i18n.test.tsx
done
rm -rf "$HID"

finish
