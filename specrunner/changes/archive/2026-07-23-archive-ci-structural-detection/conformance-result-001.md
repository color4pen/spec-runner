# Conformance Result — archive-ci-structural-detection — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

`git diff main...HEAD --stat` で確認したスコープ:
- `src/core/archive/workflow-ci-detection.ts` — 新規モジュール（108 行）
- `src/core/archive/merge-then-archive.ts` — 52 行変更（+49/-3）
- `src/core/archive/__tests__/workflow-ci-detection.test.ts` — 新規テスト（393 行）
- `src/core/archive/__tests__/merge-then-archive.test.ts` — テスト追加（565 行）
- `specrunner/changes/archive-ci-structural-detection/` — change folder artifacts のみ

## J1: Tasks Checklist

tasks.md の全チェックボックスが `[x]` 完了。T-01〜T-05 の acceptance criteria をすべて満たす evidence を各セクションで確認した。

## J2: Design Decisions

### D1 — 構造判定（時間観測でなく）
`merge-then-archive.ts` の `rollup.state === "none"` かつ grace 超過パスで `detectWorkflowCiPresence` を呼び出している（L631–640）。grace 時間は "いつ判定するか" のトリガとして保持されており、"CI-less か" の結論は structural 判定に置き換わった。✓

### D2 — テキストレベルのトリガ検出、YAML parser なし、fail-closed バイアス
`workflow-ci-detection.ts:29-30` に `CI_TRIGGER_RE` を定義。`push` と `pull_request`（prefix match で `pull_request_target`/`pull_request_review` も捕捉）をテキストレベルで検出。YAML parser は使用していない。誤検出は waiting 側（fail-closed）に倒れる。✓

### D3 — 純粋モジュールへの分離、spawn 注入
`src/core/archive/workflow-ci-detection.ts` が `SpawnFn` を注入パラメータとして受け取り、`GitHubClient` も `orchestrator.js` もインポートしていない。unit test で keyed fake spawn を使って独立テスト可能。✓

### D4 — "none" ブランチへの fail-closed ゲートとして配線
実装確認（L642–671）:
- `!cachedCiPresence.present`（CI-less）→ 既存 CI-less ログ + `break`（merge）。✓
- `cachedCiPresence.present === true`（CI-present）→ merge せず deadline チェック → timeout なら escalation、そうでなければ `sleepFn` + `continue`。✓
- `BLOCKED_CHECK_GRACE_MS` と `success`/`failure`/`pending`/conflict/BLOCKED パスは変更なし。✓

### D5 — `undefined` archiveSha と inspection 失敗は fail-closed
`L634–638`: `archiveSha === undefined` の場合は detection を skip して `{ present: true, reason: "inspection-failed" }` をセット（ls-tree を呼び出さない）。inspection 実行中の git 呼び出し失敗時も `{ present: true, reason: "inspection-failed" }` を返す（workflow-ci-detection.ts L57-58, L97-98）。✓

## J3: Spec Requirements and Scenarios

### Requirement 1: CI presence は構造的に判定（SHALL/MUST）

| SHALL / MUST 条件 | 実装証拠 |
|---|---|
| archive commit tree の workflow 存在で判定（時間でない） | merge-then-archive.ts L631–640 |
| local git 検査のみ使用、GitHub API 呼び出し追加なし | workflow-ci-detection.ts は `SpawnFn` のみ使用 |
| 1 run あたり最大 1 回計算・キャッシュ | `cachedCiPresence` 変数、TC-016 で ls-tree invocation = 1 をアサート ✓ |

**Scenario 1** (push/pull_request workflow → fail-closed → timeout escalation): TC-001 が multi-poll で `mergeWaitTimeoutMs` 超過 → escalation、`mergePullRequest` 未呼び出しをアサート ✓

**Scenario 2** (workflow なし → CI-less → merge): TC-002 が empty ls-tree → merge 実行をアサート（TBG-05 も維持）✓

**Scenario 3** (schedule-only → CI-less → merge): TC-003 が schedule-only workflow → merge 実行をアサート ✓

**Scenario 4** (unreadable archive commit → fail-closed):
- Case A: `archiveSha === undefined` → TC-015 が ls-tree 呼び出しなし + exitCode 1 をアサート ✓
- Case B: `git ls-tree` non-zero exit → TC-004 が inspection-failed → fail-closed → escalation をアサート ✓

### Requirement 2: trigger detection は依存追加なし、GitHub API なし

| SHALL / MUST 条件 | 実装証拠 |
|---|---|
| YAML parser 不使用、新規 package 依存なし | `git diff main...HEAD -- package.json` 変更なし ✓ |
| push/pull_request トークンが CI-present 判定に十分 | CI_TRIGGER_RE パターン、TC-007/008/013/014 ✓ |
| 曖昧・over-matching テキストは CI-present 側に解決 | fail-closed バイアス設計（D2）、`pull_request_target` prefix match TC-013 ✓ |

**Scenario: detection uses local git only**: workflow-ci-detection.ts は `spawn("git", ...)` のみ使用 ✓

**Scenario: no new package dependency**: `package.json` の `dependencies` に変更なし（diff 空）✓

## J4: Request Acceptance Criteria

| 受け入れ基準 | テスト根拠 |
|---|---|
| push/pull_request workflow の tree で rollup "none" が grace を超えても merge に進まず、`mergeWaitTimeoutMs` 超過で escalation | TC-001: exitCode 1、`mergePullRequest` 未呼び出し ✓ |
| workflow 定義の無い tree では grace 超過後に merge へ進む | TC-002: exitCode 0、`mergePullRequest` 呼び出し確認 ✓（TBG-05 regression 維持）|
| schedule のみの tree では CI-less 判定になる | TC-003: exitCode 0、merge 実行 ✓ |
| 新規 package 依存を追加しない（package.json の dependencies 無変更）| `git diff main...HEAD -- package.json` → 変更なし ✓ |
| `typecheck && test` が green | verification-result.md: build / typecheck / test / lint / changed-line-coverage すべて passed ✓ |

## 検証できなかった項目

None。

## Findings 詳細

所見なし（code review F-001/F-002 は non-blocking info として review-feedback-001.md に既記録済）。
