# Conformance Result — packaged-smoke-contract — iter 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | 全チェックボックス [x] 済み（T-01〜T-08） |
| design.md | ✅ | D1〜D6 すべて実装済み（下記詳細参照） |
| spec.md | ✅ | 全 Requirement の SHALL/MUST と全 Scenario が実装で成立 |
| request.md | ✅ | T1〜T7 全受け入れ基準を満たす |

## Scope of Changes

```
scripts/smoke/package-smoke.sh           295 lines (new)
.github/workflows/ci.yml                  10 lines changed
package.json                               3 lines changed
tests/package-smoke-contract.test.ts     149 lines (new)
specrunner/changes/packaged-smoke-contract/  (pipeline artifacts only)
```

`src/` は無変更。CI の他 job / step・`publish.yml`・既存 build/test/lint script は無変更。

## Design Decision Conformance

| Decision | Status | Evidence |
|----------|--------|----------|
| D1: スクリプト切り出し、CI は呼ぶだけ | ✅ | `scripts/smoke/package-smoke.sh` 新規、ci.yml は `bash scripts/smoke/package-smoke.sh` 1 行（line 43） |
| D2: pack → 隔離 consumer install → dist 解決 → node | ✅ | `npm pack --pack-destination` → `npm install --omit=optional` → `node_modules/@color4pen/specrunner/dist/specrunner.js` |
| D3: mktemp 隔離・XDG/HOME 差し替え・非対話 | ✅ | 全 scenario で `XDG_CONFIG_HOME`/`HOME` を temp 配下へ差し替え、`--provider anthropic < /dev/null` |
| D4: doctor は per-check status で判定（全体 exit 不使用） | ✅ | `|| true` で exit を無視、`node -e` JSON parse で `config-file-exists` status のみ判定 |
| D5: scenario 分割・PASS/FAIL 行・個別 falsifiable | ✅ | TC-001〜TC-005 が独立 fixture 付き、FAIL_COUNT 集計で最終 exit |
| D6: CI step 置き換え・package.json convenience entry | ✅ | ci.yml line 42-43 に新 step、`"smoke": "bash scripts/smoke/package-smoke.sh"` を additive 追加 |

## Spec Requirement Conformance

### Requirement 1: packed tarball + node のみで初回接触契約を assert する

- **S1/TC-001 (repo 外 init)**: `GIT_CEILING_DIRECTORIES` guard → exit 非ゼロ / `specrunner/` 不在 / `.gitignore` 不在 / XDG 配下 config.json 不在 の 4 点 assert。✅
- **S2/TC-002 (subdirectory init)**: exit 0 / `<root>/specrunner/drafts` 存在 / `<root>/specrunner/changes` 存在 / subdir 配下入れ子なし / stdout に "created" 含む の 5 点 assert。✅
- **S3/TC-003 (XDG doctor)**: `doctor --json` を `|| true` で起動し、stdout JSON を `node -e` で parse、`config-file-exists` check の `status === "pass"` を per-check で判定。doctor 全体 exit code は判定に使用しない。✅
- **S4/TC-004 (subdirectory request new)**: exit 0 / `<root>/specrunner/drafts/<slug>/request.md` 存在 / subdir 配下入れ子なし の 3 点 assert。✅
- **S5/TC-005 (help)**: `node <dist> --help` が exit 0。✅
- **TC-006 (bun / src/ 非参照)**: スクリプト内に bun 呼び出しなし・`src/` 参照なし。`tests/package-smoke-contract.test.ts` の TC-006 が vitest で機械検証。✅

### Requirement 2: 環境隔離・token フリー

全 fixture は `mktemp -d` 配下。`XDG_CONFIG_HOME`/`HOME` を temp へ差し替えることで runner / 開発者機の実 config・認証を参照しない。doctor は per-check 判定で token 有無に非依存。✅

### Requirement 3: CI gate + ローカル実行可能

`Package smoke (first-contact contract assertions)` step として ci.yml に追加済み（`bun run build` より後）。`package.json` に `smoke` convenience script 追加。✅

### Requirement 4: 各 assert が独立 falsifiable

scenario ごとに独立 fixture を使用。tasks.md T-07（破壊確認）全チェックボックス済み。✅

## Acceptance Criteria Conformance

| Criterion | Status |
|-----------|--------|
| T1: repo 外 init の非ゼロ exit と無書き込み（XDG 配下含む） | ✅ |
| T2: subdirectory init の root 着地・入れ子なし・created 報告 | ✅ |
| T3: 隔離 XDG → init → doctor config-file-exists = pass（per-check） | ✅ |
| T4: subdirectory request new の root 着地・入れ子なし | ✅ |
| T5: packed tarball + node のみ（bun / src/ 非参照）・ローカル実行可能 | ✅ |
| T6: 破壊確認（期待値反転で各 scenario が単独で落ちることを確認後に戻す） | ✅ tasks.md T-07 全 [x] |
| T7: CI green・typecheck && test green | ✅ verification-result.md 全フェーズ passed |

## Code Review Findings Resolution

code-review iteration 001 の 2 件（いずれも low severity）は regression-gate-result-002.md で両方 FIXED を確認済み:

1. **S4 の exit 0 assert 欠落** → `assert_exit_zero "TC-004/S4/exit-zero"` を line 277 に追加。実装済み。
2. **TC-006 の test-cases.md カテゴリ誤記** → `automated` に修正・Summary 更新。実装済み。

## Summary

実装はすべての設計判断（D1〜D6）・spec 要件（Requirement 1〜4）・受け入れ基準（T1〜T7）に適合する。スコープ外の製品コード（`src/`）・他 CI step・`publish.yml` に変更なし。verification-result.md にて build / typecheck / test / lint の全フェーズが passed を確認。
