# finish Phase 1 末尾の commit step を復元する (= PR #347 で削除された commit 責務の再導入)

## Meta

- **type**: spec-change
- **slug**: finish-phase1-commit-restore
- **base-branch**: main
- **adr**: false

## 背景

`specrunner job finish` の Phase 1 は以下 3 step で構成されるべきだが、現状 step 3 が **抜けている**:

| # | step | git 操作 |
|---|---|---|
| 1 | `mergeSpecsForChange` | `fs.writeFile` + `git add specrunner/specs/` |
| 2 | `archiveChangeFolder` | `git mv changes/<slug>/ → changes/archive/<YYYY-MM-DD>-<slug>/` + `git add changes/` |
| 3 | **commit (= 抜けている)** | `git diff --cached --quiet` + `git commit -m "chore: archive <slug>"` |

### 混入経緯

PR #347 (= commit `9883d989`、2026-05-20「request 起票エントリポイントを `drafts/` に rename」) で `moveRequestsDir` 関数を削除した。この関数は名前から「ファイル移動」と認識されたが、実体は:

1. `git mv specrunner/requests/active/<slug>.md → merged/<slug>.md` (= PR #347 で不要になった操作)
2. `git diff --cached --quiet` で staging 検出
3. `git commit -m "chore: archive <slug>"` ← **これが step 1 + step 2 の staging まで含めて 1 commit にまとめていた**

PR #347 は「`requests/active → merged` の移動が不要になった」と判断して関数全体を削除したが、副次的責務だった **commit 操作** まで失った。

### 観測される症状

PR #347 以降の全 finish (= PR #350, #351, #353) で以下が main に反映されていない:

| 対象 | 期待 | 実態 |
|---|---|---|
| `specrunner/specs/<capability>/spec.md` への delta merge | 反映 | 反映されず (= 旧記述のまま) |
| `specrunner/changes/<slug>/` の archive 移動 | `archive/<slug>/` 配下に移動 | active のまま残存 |

例:
- `specrunner/specs/cli-finish-command/spec.md`: PR #353 の delta (= 「archive path は `<YYYY-MM-DD>-<slug>` 形式」) が未反映、`grep "YYYY-MM-DD"` ヒット 0
- `specrunner/specs/cli-commands/spec.md`: PR #347 の delta (= `requests/active/` → `drafts/`) が未反映、`grep drafts` ヒット 0
- `specrunner/changes/dated-archive-folders/`, `merged-to-archive-consolidation/`, `request-review-detect-baseline-edit-intent/` が active のまま

### 既存 spec との整合

`specrunner/specs/cli-finish-command/spec.md` L66-76 は既に「Phase 1 で `git commit "chore: archive <slug>"` する」と明記しており、**spec と実装が乖離している**状態。本 request は実装を spec に追随させる bug-fix。

## 要件

### 1. Phase 1 末尾の commit step を関数として復元

`src/core/finish/` に新規 module (= 名前は design agent 判断、例: `commit-archive.ts`) を追加し、以下の責務を持たせる:

- `git diff --cached --quiet` で staging 有無を検出 (= exit code 0 = staging なし、non-zero = staging あり)
- staging があれば `git commit -m "chore: archive <slug>"` を実行
- staging がなければ commit skip (= idempotent、resume 経路で再実行された場合に二重 commit しない)
- commit 失敗時は escalation を返す

### 2. orchestrator.ts:runPhase1Archive への呼び出し追加

`src/core/finish/orchestrator.ts:runPhase1Archive` の末尾 (= `archiveChangeFolder` 呼び出し後、`return { ok: true }` の前) に新関数の呼び出しを追加する。

呼び出し失敗時は他の step と同様 escalation で halt する。

### 3. test 追加

- 新関数の unit test:
  - staging あり → commit 実行 → `ok: true, skipped: false`
  - staging なし → commit skip → `ok: true, skipped: true`
  - commit 失敗 → escalation 返却
- orchestrator integration test の更新 (= 該当 test ファイル名は design agent 判断):
  - Phase 1 通過後に commit step が呼ばれることを assert
  - spec-merge / archive 後に `git diff --cached --quiet` exit code 0 になることを assert (= 全 staging が commit に消化される)

### 4. spec への新規 Requirement / Scenario 追加

`cli-finish-command` capability の delta spec に、Phase 1 末尾の commit step を **新 Requirement** として明文化する。既存の L66-76 は文言として古い openspec 時代の概念 (= `active → merged`) を含むが、本 request では **新 Requirement 追加のみ**とし、既存記述の cleanup は別 issue。

新 Requirement の方針:
- 「Phase 1 末尾で staging が存在する場合、`git commit -m "chore: archive <slug>"` を実行する」
- 「staging が存在しない場合は commit を skip する (= idempotent)」

具体的な Scenario / 文言は design / spec-review phase で決定する。

## スコープ外

- **過去 3 PR (= #347 / #350 / #351 / #353) の積み残し修復**: main 上の delta merge + archive 移動は本 request の merge 後に **手動 git 操作で別途実施** する。本 request は code fix のみ
- **`moveRequestsDir` 関数の復活**: 旧 `specrunner/requests/active/` → `merged/` の物理移動は PR #347 で正しく不要化されており、復活させない
- **既存 spec L66-76 の openspec 時代文言 cleanup**: `active → merged` 等の旧表現整理は別 issue
- **self-bootstrap の archive 反映**: 本 request 自身の finish では Phase 1 が現状 bug で archive 移動が main に反映されない (= chicken-and-egg)。merge 後の手動 archive 修復は別途

## 受け入れ基準

- [ ] Phase 1 末尾に commit step が追加され、`mergeSpecsForChange` + `archiveChangeFolder` の staging を 1 commit にまとめる
- [ ] commit step は `git diff --cached --quiet` で staging を検出し、staging がない場合は commit を skip する (= idempotent)
- [ ] commit message は `chore: archive <slug>` 形式である
- [ ] commit 失敗時は escalation を返し、Phase 2 push に進まない
- [ ] orchestrator.ts:runPhase1Archive で新関数が呼ばれている
- [ ] `cli-finish-command` capability の delta spec に Phase 1 末尾 commit step の Requirement が新規追加されている
- [ ] 新関数の unit test (= staging あり / なし / commit 失敗) が追加され green
- [ ] orchestrator integration test に Phase 1 末尾 commit が走ることを assert する test が追加され green
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
