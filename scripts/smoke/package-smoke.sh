#!/usr/bin/env bash
# scripts/smoke/package-smoke.sh
#
# Package smoke: assert first-contact contracts using the packed tarball + node only.
# No bun. No src/ references. Pure npm / node / git / mktemp / coreutils.
#
# Local run: bash scripts/smoke/package-smoke.sh
#
# What it does:
#   1. Verifies dist/specrunner.js exists (TC-012 — build first if not)
#   2. npm pack → installs tarball in an isolated consumer project
#   3. Runs assertion scenarios S1–S5 using node + the installed dist
#   4. Cleans up all temp dirs on exit via trap (TC-014)
#
# TC-001: init outside a git repository exits non-zero and writes nothing
# TC-002: init from a subdirectory lands scaffold at repo root without nesting and reports created
# TC-003: isolated XDG init then doctor reports config-file-exists pass judged per-check
# TC-004: request new from a subdirectory lands at repo root without nesting
# TC-005: help startup check is retained on the packaged artifact
# TC-007: assertions hold regardless of ambient tokens (hermeticity: isolated XDG/HOME for all CLI calls)
# TC-008: fixtures and config are isolated from the host (all fixtures in mktemp)
# TC-012: exits with explicit error when dist/specrunner.js is absent
# TC-014: temp dir is cleaned up after script exits (trap EXIT)

set -u

# ── Repo root resolution ─────────────────────────────────────────────────────
# SMOKE_REPO_ROOT override allows tests to point to a directory without dist
# (e.g. for TC-012 unit test) without affecting the real repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SMOKE_REPO_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"

# ── TC-012: Pre-check: dist must exist ──────────────────────────────────────
# The smoke script does NOT build — it asserts the already-built artifact.
DIST_PATH="${REPO_ROOT}/dist/specrunner.js"
if [ ! -f "${DIST_PATH}" ]; then
  echo "ERROR: dist/specrunner.js not found at ${DIST_PATH}" >&2
  echo "Run 'bun run build' first to generate the dist bundle before running the smoke." >&2
  echo "(This script does not invoke bun — build separately then re-run.)" >&2
  exit 1
fi

# ── TC-008 / TC-014: Temp dir management ─────────────────────────────────────
# All fixtures live under SMOKE_TMP; PACK_DIR holds the generated tarball.
# Both are cleaned up via trap EXIT regardless of success or failure.
SMOKE_TMP="$(mktemp -d)"
PACK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${SMOKE_TMP}" "${PACK_DIR}"
}
trap cleanup EXIT

# ── Pack the tarball ─────────────────────────────────────────────────────────
# Runs from REPO_ROOT so npm picks up package.json.
# --pack-destination routes the .tgz to PACK_DIR (requires npm ≥7; node 20 ships npm 10).
(cd "${REPO_ROOT}" && npm pack --pack-destination "${PACK_DIR}" >/dev/null 2>&1)
TARBALL="$(ls "${PACK_DIR}"/*.tgz 2>/dev/null | head -1)"
if [ -z "${TARBALL}" ]; then
  echo "ERROR: npm pack did not produce a .tgz file in ${PACK_DIR}" >&2
  exit 1
fi

# ── Consumer install (TC-007: isolated from real npm/node_modules) ───────────
# Install into an isolated consumer project; the installed dist is the single
# artifact under test. No bun, no src/ references.
CONSUMER_DIR="${SMOKE_TMP}/consumer"
mkdir -p "${CONSUMER_DIR}"
(cd "${CONSUMER_DIR}" && npm init -y >/dev/null 2>&1)
(cd "${CONSUMER_DIR}" && npm install --omit=optional "${TARBALL}" >/dev/null 2>&1)
DIST="${CONSUMER_DIR}/node_modules/@color4pen/specrunner/dist/specrunner.js"
if [ ! -f "${DIST}" ]; then
  echo "ERROR: installed dist not found at ${DIST}" >&2
  echo "npm install may have failed or package.bin path is wrong." >&2
  exit 1
fi

# ── Assertion helpers ────────────────────────────────────────────────────────
FAIL_COUNT=0
PASS_COUNT=0

pass() {
  local scenario="$1" detail="${2:-}"
  printf "[SMOKE] PASS  scenario=%-30s %s\n" "${scenario}" "${detail}"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  local scenario="$1" detail="${2:-}"
  printf "[SMOKE] FAIL  scenario=%-30s %s\n" "${scenario}" "${detail}" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

assert_exit_nonzero() {
  local scenario="$1" actual="$2"
  if [ "${actual}" -ne 0 ]; then
    pass "${scenario}" "exit=${actual} (non-zero as expected)"
  else
    fail "${scenario}" "expected non-zero exit, got 0"
  fi
}

assert_exit_zero() {
  local scenario="$1" actual="$2"
  if [ "${actual}" -eq 0 ]; then
    pass "${scenario}" "exit=0"
  else
    fail "${scenario}" "expected exit 0, got ${actual}"
  fi
}

assert_absent() {
  local scenario="$1" path="$2"
  if [ ! -e "${path}" ]; then
    pass "${scenario}" "absent: ${path##*/}"
  else
    fail "${scenario}" "expected absent but found: ${path}"
  fi
}

assert_present() {
  local scenario="$1" path="$2"
  if [ -e "${path}" ]; then
    pass "${scenario}" "present: ${path##*/}"
  else
    fail "${scenario}" "expected present but missing: ${path}"
  fi
}

assert_stdout_contains() {
  local scenario="$1" text="$2" pattern="$3"
  if printf '%s' "${text}" | grep -qF "${pattern}"; then
    pass "${scenario}" "stdout contains '${pattern}'"
  else
    fail "${scenario}" "stdout missing '${pattern}'"
  fi
}

# ── TC-005 / S5: --help startup check ────────────────────────────────────────
# Verifies the packaged artifact can start and print usage.
echo ""
echo "=== TC-005 / S5: --help startup check ==="
S5_EXIT=0
node "${DIST}" --help >/dev/null 2>&1 || S5_EXIT=$?
assert_exit_zero "TC-005/S5/help-exit" "${S5_EXIT}"

# ── TC-001 / S1: init outside a git repo ────────────────────────────────────
# TC-007: XDG and HOME are isolated; no ambient credentials affect the outcome.
# TC-008: fixture is in mktemp, not the real home.
echo ""
echo "=== TC-001 / S1: init outside a git repo ==="
S1_DIR="${SMOKE_TMP}/s1-outside"
S1_XDG="${SMOKE_TMP}/s1-xdg"
S1_HOME="${SMOKE_TMP}/s1-home"
mkdir -p "${S1_DIR}" "${S1_XDG}" "${S1_HOME}"

# Guard: confirm S1_DIR is not inside any git repo before running the assertion.
# GIT_CEILING_DIRECTORIES prevents git from traversing above SMOKE_TMP.
if GIT_CEILING_DIRECTORIES="${SMOKE_TMP}" git -C "${S1_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
  fail "TC-001/S1/env-guard" "fixture appears to be inside a git repo — environment issue"
else
  S1_EXIT=0
  (cd "${S1_DIR}" && HOME="${S1_HOME}" XDG_CONFIG_HOME="${S1_XDG}" GIT_CEILING_DIRECTORIES="${SMOKE_TMP}" \
    node "${DIST}" init --provider anthropic \
    < /dev/null > "${SMOKE_TMP}/s1-stdout.txt" 2>"${SMOKE_TMP}/s1-stderr.txt") \
    || S1_EXIT=$?

  # Assert 1: non-zero exit (no git repo → init must refuse)
  assert_exit_nonzero "TC-001/S1/exit-nonzero" "${S1_EXIT}"
  # Assert 2: no specrunner/ directory created in fixture
  assert_absent "TC-001/S1/no-specrunner-dir" "${S1_DIR}/specrunner"
  # Assert 3: no .gitignore created in fixture
  assert_absent "TC-001/S1/no-gitignore" "${S1_DIR}/.gitignore"
  # Assert 4: no config.json written under isolated XDG (TC-007: isolation works)
  assert_absent "TC-001/S1/no-xdg-config" "${S1_XDG}/specrunner/config.json"
fi

# ── TC-002 / S2: init from subdirectory → root landing, no nesting, created report ─
# TC-007: XDG and HOME are isolated so no real credentials affect init.
# TC-008: fixture repo is in mktemp.
echo ""
echo "=== TC-002 / S2: init from subdirectory ==="
S2_REPO="${SMOKE_TMP}/s2-repo"
S2_SUB="${S2_REPO}/sub/deep"
S2_XDG="${SMOKE_TMP}/s2-xdg"
S2_HOME="${SMOKE_TMP}/s2-home"
mkdir -p "${S2_SUB}" "${S2_XDG}" "${S2_HOME}"
git -C "${S2_REPO}" init --quiet 2>/dev/null
git -C "${S2_REPO}" config user.email "smoke@example.com" 2>/dev/null
git -C "${S2_REPO}" config user.name "Smoke Test" 2>/dev/null

S2_EXIT=0
(cd "${S2_SUB}" && HOME="${S2_HOME}" XDG_CONFIG_HOME="${S2_XDG}" \
  node "${DIST}" init --provider anthropic \
  < /dev/null > "${SMOKE_TMP}/s2-stdout.txt" 2>"${SMOKE_TMP}/s2-stderr.txt") \
  || S2_EXIT=$?
S2_STDOUT="$(cat "${SMOKE_TMP}/s2-stdout.txt")"

# Assert 1: exit 0
assert_exit_zero "TC-002/S2/exit-zero" "${S2_EXIT}"
# Assert 2: specrunner/drafts exists at repo root (not in subdir)
assert_present "TC-002/S2/root-drafts" "${S2_REPO}/specrunner/drafts"
# Assert 3: specrunner/changes exists at repo root
assert_present "TC-002/S2/root-changes" "${S2_REPO}/specrunner/changes"
# Assert 4: no nested specrunner/ in subdirectory
assert_absent "TC-002/S2/no-nested-specrunner" "${S2_SUB}/specrunner"
# Assert 5: stdout contains "created" item report
assert_stdout_contains "TC-002/S2/stdout-created" "${S2_STDOUT}" "created"

# ── TC-003 / S3: isolated XDG init → doctor --json → config-file-exists = pass ─
# TC-007: doctor exit code is NOT used for judgment (token-absent = overall exit 1).
# TC-007: isolated XDG ensures config-file-exists reflects our init, not real config.
echo ""
echo "=== TC-003 / S3: isolated XDG doctor config-file-exists check ==="
S3_REPO="${SMOKE_TMP}/s3-repo"
S3_XDG="${SMOKE_TMP}/s3-xdg"
S3_HOME="${SMOKE_TMP}/s3-home"
mkdir -p "${S3_REPO}" "${S3_XDG}" "${S3_HOME}"
git -C "${S3_REPO}" init --quiet 2>/dev/null
git -C "${S3_REPO}" config user.email "smoke@example.com" 2>/dev/null
git -C "${S3_REPO}" config user.name "Smoke Test" 2>/dev/null

# Step 1: init with isolated XDG so config is written to S3_XDG
(cd "${S3_REPO}" && HOME="${S3_HOME}" XDG_CONFIG_HOME="${S3_XDG}" \
  node "${DIST}" init --provider anthropic \
  < /dev/null > /dev/null 2>&1) || true

# Step 2: doctor --json with the same XDG; capture stdout only (exit code is not the judge)
S3_DOCTOR_JSON_FILE="${SMOKE_TMP}/s3-doctor.json"
(cd "${S3_REPO}" && HOME="${S3_HOME}" XDG_CONFIG_HOME="${S3_XDG}" \
  node "${DIST}" doctor --json \
  > "${S3_DOCTOR_JSON_FILE}" 2>/dev/null) || true

# Step 3: parse config-file-exists status via node -e (no jq dependency)
S3_STATUS="$(node -e "
const fs = require('fs');
try {
  const raw = fs.readFileSync('${S3_DOCTOR_JSON_FILE}', 'utf8');
  const data = JSON.parse(raw);
  const results = data.results || [];
  const check = Array.isArray(results) ? results.find(function(c) { return c.name === 'config-file-exists'; }) : undefined;
  process.stdout.write(check ? String(check.status) : 'not-found');
} catch(e) {
  process.stdout.write('parse-error:' + String(e.message));
}
" 2>/dev/null || echo "node-error")"

# Assert: per-check status is pass (NOT judged by overall doctor exit code — TC-007)
if [ "${S3_STATUS}" = "pass" ]; then
  pass "TC-003/S3/config-file-exists" "per-check status=pass"
else
  fail "TC-003/S3/config-file-exists" "expected per-check status=pass, got: ${S3_STATUS}"
fi

# ── TC-004 / S4: request new from subdirectory → root landing, no nesting ────
# TC-007: isolated HOME/XDG; request new needs no token.
# TC-008: fixture in mktemp.
echo ""
echo "=== TC-004 / S4: request new from subdirectory ==="
S4_REPO="${SMOKE_TMP}/s4-repo"
S4_SUB="${S4_REPO}/sub/deep"
S4_XDG="${SMOKE_TMP}/s4-xdg"
S4_HOME="${SMOKE_TMP}/s4-home"
S4_SLUG="smoke-request-fixture"
mkdir -p "${S4_SUB}" "${S4_XDG}" "${S4_HOME}"
git -C "${S4_REPO}" init --quiet 2>/dev/null
git -C "${S4_REPO}" config user.email "smoke@example.com" 2>/dev/null
git -C "${S4_REPO}" config user.name "Smoke Test" 2>/dev/null

# Run request new from subdirectory (non-interactive via /dev/null)
S4_EXIT=0
(cd "${S4_SUB}" && HOME="${S4_HOME}" XDG_CONFIG_HOME="${S4_XDG}" \
  node "${DIST}" request new "${S4_SLUG}" \
  < /dev/null > /dev/null 2>&1) || S4_EXIT=$?

# Assert 1: request.md exists at repo root (not in subdirectory)
assert_present "TC-004/S4/root-request-md" "${S4_REPO}/specrunner/drafts/${S4_SLUG}/request.md"
# Assert 2: no nested specrunner/ in subdirectory
assert_absent "TC-004/S4/no-nested-specrunner" "${S4_SUB}/specrunner"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Smoke summary ==="
echo "PASS: ${PASS_COUNT}  FAIL: ${FAIL_COUNT}"
echo ""

if [ "${FAIL_COUNT}" -gt 0 ]; then
  echo "[SMOKE] RESULT: FAIL  (${FAIL_COUNT} assertion(s) failed)" >&2
  exit 1
else
  echo "[SMOKE] RESULT: PASS  (all ${PASS_COUNT} assertions passed)"
  exit 0
fi
