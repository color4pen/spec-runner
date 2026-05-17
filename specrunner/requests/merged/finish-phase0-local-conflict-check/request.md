# finish Phase 0 で base への conflict をローカル事前検証し Phase 1 半状態を構造的に防ぐ

## Meta

- **type**: spec-change
- **slug**: finish-phase0-local-conflict-check
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen
- **issue**: #270

## 背景

`specrunner finish` の Phase 0 pre-flight は conflict 判定を GitHub の `mergeStateStatus` API のみに依存している:

- Phase 0: `gh pr view --json mergeable,mergeStateStatus` を 3 回まで retry (`src/core/finish/preflight.ts:88-99`, `src/core/finish/pr-status.ts:22-23`)
- UNKNOWN が続くと「mergeable が MERGEABLE or UNKNOWN なら進む」フォールバックで Phase 1 に進行
- 実態 CONFLICTING (= ローカル `git rebase` で衝突) でも Phase 0 を通過する場合がある

Phase 0 通過後の流れ:

- Phase 1: `git mv` で archive folder 移動 + `git mv` で active→merged 移動 + `git commit -m "chore: archive <slug>"` (`src/core/finish/archive-change-folder.ts:24-76`, `src/core/finish/move-requests-dir.ts:21-107`)
- Phase 2: `git push`
- Phase 3: `gh pr view --json mergeable` の再判定 → CONFLICTING で escalate (`src/core/finish/pr-status.ts:131-226`)
- **Phase 1 commit は rollback されない** (`src/core/finish/orchestrator.ts` に reset / revert ロジック無し)

結果として feature branch に「archive 済 + push 済 + merge 不可」の半状態が残り、ユーザーは手動で `git reset --hard` + rebase + force push して再 finish が必要。直近 PR #266 / #267 で連続再現した。

関連 issue:
- #270 (本 issue)
- #197 (CLOSED): Phase 3 直前の mergeable check 実装。本 request はその前段 (Phase 0 / Phase 1 直前) を扱うため別軸。
- #257 (OPEN): finish 全体 atomicity の一貫設計。本 request は「conflict 事前検出による Phase 1 進行抑制」の部分集合。Phase 1 commit の rollback 戦略は #257 のスコープに残す。

## 目的

Phase 0 (もしくは Phase 1 開始直前) に **ローカルで** base branch との conflict を検出し、conflict があれば Phase 1 commit に進ませない。`mergeStateStatus` API の非同期遅延 / UNKNOWN 状態に依存しない判定経路を構造的に組み込む。

## 設計判断

1. **判定方法**: `git fetch origin <base>` + `git merge-tree --write-tree HEAD origin/<base>` を採用。
   - `git rebase --dry-run` は git バージョン依存で挙動が不安定 (= 古い git では dry-run flag 無し)
   - `git merge-tree` は git 2.38+ で `--write-tree` をサポートし、衝突検出が exit code / stdout で機械的に取得可能
   - 既存 spec-runner の git 操作は `git fetch` を多用しており (例: `src/core/finish/branch-checkout.ts:48`)、git 2.38+ 前提と整合

2. **判定タイミング**: Phase 0 内で実行。preflight (mergeStateStatus check) の **直後**、`runPhase1Archive()` 開始の **前** に新規 step を挿入する。
   - 順序: `runPreflight` (= GitHub API) → `runPhase0LocalConflictCheck` (= 本 request 新設) → `runPhase1Archive`
   - 早期 fail-fast により Phase 1 commit が走らないことを保証

3. **mergeStateStatus 依存は維持 (補助として)**: Phase 0 の GitHub API check を **削除しない**。両者を組み合わせ「GitHub 側 OK かつローカル OK」で通過。冗長だが mergeStateStatus は ahead/behind / draft 等の状態判定にも使われているため (`src/core/finish/pr-status.ts` 既存ロジック維持)

4. **escalation 時の案内**: conflict 検出時の escalation message に「ローカルで `git rebase origin/<base>` してください」を含める。具体的な復旧手順をユーザーに提示。

5. **fetch 失敗の扱い**: `git fetch origin <base>` が失敗 (= ネットワーク不可 / auth 失敗) した場合は escalation。silent skip は禁止。

6. **既存 retry とのインタラクション**: GitHub mergeStateStatus retry は維持。ローカル check は retry 不要 (deterministic)。両方が独立に escalate しうる。

7. **base branch 名の取得**: `src/cli/finish.ts:86-96` で request.md から取得済の `baseBranch` を orchestrator に流す既存経路を使う。新規取得経路は作らない。

## 要件

### 1. 新規 module: `src/core/finish/local-conflict-check.ts`

以下 export を持つ新規 module を追加する:

- `runLocalConflictCheck(deps: { baseBranch: string, spawn: SpawnFn, stdout: (msg: string) => void, stderr: (msg: string) => void }): Promise<{ ok: true } | { ok: false, conflictPaths: string[] }>`
- 内部処理:
  1. `git fetch origin <baseBranch>` を実行 (失敗は throw して escalation)
  2. `git merge-tree --write-tree HEAD origin/<baseBranch>` を実行
  3. exit code 非 0 または stdout に CONFLICT marker / `<<<<<<<` が含まれる場合は conflict 検出
  4. conflict 検出時は stdout から conflict path を抽出 (parse) して return

`SpawnFn` は `src/core/finish/orchestrator.ts` で利用されている spawn injection 型と整合させる。stdout/stderr は既存 finish module 既存のインライン型 `(msg: string) => void` を踏襲する (= `WriteFn` 型 alias は codebase に存在しないため新規導入しない)。

### 2. `runPhase0LocalConflictCheck` を orchestrator に組み込み

`src/core/finish/orchestrator.ts`:

- 既存 `runPreflight()` (L109-113) の **直後** に新 step `runPhase0LocalConflictCheck()` を挿入
- 戻り値が `{ ok: false }` の場合は escalation message を整形して **`{ exitCode: 1, escalation }` を return** する (= 既存 Phase 0 preflight escalation と同じ return-only パターン)。`transitionJob` 呼び出しは行わない。
- escalation message: `"Phase 0 local conflict check failed: <slug> conflicts with origin/<base> at:\n  - <path1>\n  - <path2>\n\nRecover by:\n  1. git rebase origin/<base> (or resolve conflicts via worktree)\n  2. specrunner finish <slug> を再実行"`

### 3. escalation 時の job state

- `runPhase1Archive()` 以降は **実行しない**
- job state は **変更しない** (= 既存 Phase 0 escalation と同等。state を `awaiting-resume` に遷移させると `assertJobFinishable` (`src/core/finish/job-state-update.ts:15`) が次回 `specrunner finish` を block し、recovery 案内の「rebase + finish 再実行」フローが実現できない)
- markJobArchived は呼ばない
- 後続実行: ユーザーが `git rebase` して conflict を解消した後、同じ job state (= 元の status) のまま `specrunner finish <slug>` を再実行できる

### 4. fetch failure の挙動

- `git fetch origin <base>` が non-zero exit した場合: 上記同様 `{ exitCode: 1, escalation }` を return (state 変更なし)
- escalation message: `"Phase 0 git fetch failed for origin/<base>: <stderr>"`
- silent skip / フォールバック (= fetch 失敗時に GitHub API のみで判定) は **禁止**

### 5. mergeStateStatus check との順序

- 順序: `runPreflight()` (= GitHub mergeStateStatus retry) → **success** → `runPhase0LocalConflictCheck()` → success → `runPhase1Archive()`
- どちらかが fail/escalate した時点で Phase 1 に進まない
- 既存 `runPreflight()` の挙動は変更しない (= 既存 test regression なし)

### 6. test

`tests/unit/core/finish/local-conflict-check.test.ts` (新規) に以下:

- TC: `git fetch` 成功 + `merge-tree` 出力に conflict marker 無し → `{ ok: true }`
- TC: `git fetch` 成功 + `merge-tree` 出力に `<<<<<<<` あり → `{ ok: false, conflictPaths: [...] }`
- TC: `git fetch` 失敗 → throw / reject
- TC: 複数 conflict path の抽出が正しい

git 2.38+ 前提のため「old git で `--write-tree` flag 非対応」TC は含めない (= 環境前提として満たされる)。

`tests/unit/core/finish/orchestrator.test.ts` (or 既存 finish integration test) に以下を追加:

- TC: Phase 0 local conflict check fail で Phase 1 archive が走らないこと
- TC: Phase 0 local conflict check fail で `{ exitCode: 1, escalation }` が return される (job state は変更されない)
- TC: Phase 0 local conflict check fail 後に再度 `specrunner finish` を呼ぶと再実行可能であること (= state block されない)
- TC: Phase 0 local conflict check fail で escalation message に recovery 手順 (`git rebase origin/<base>` + `specrunner finish <slug>` 再実行案内) が含まれること
- TC: Phase 0 local conflict check pass で Phase 1 以降が従来通り走ること
- 既存の Phase 1/2/3 関連 test が regression していないこと

### 7. base branch の取得経路

`src/cli/finish.ts:86-96` 既存実装 (`parsed.baseBranch`, fallback "main") を変更せず、orchestrator 経由で `runPhase0LocalConflictCheck()` に渡す。新規 base branch 取得ロジックを増やさない。

### 8. spec authority への反映

権威 spec を調査の上、以下のいずれかで対応:

- `specrunner/specs/finish-orchestration/spec.md` (または該当する finish capability) を MODIFIED で更新し、Phase 0 にローカル conflict check が含まれること、Phase 1 進行条件を明文化
- 既存に該当 capability が無い場合は新規 capability `finish-phase0-local-conflict-check` を ADDED で立てる

調査結果 (= 該当 capability が存在するか、その正確な名前) は design.md に記録する。

## スコープ外

- Phase 1 commit の rollback / revert ロジック (= 既に Phase 1 commit が乗ってしまった場合の事後修復、#257 の atomicity 設計で扱う)
- Phase 3 直前 retry の改廃 (= 既存 #197 実装を維持)
- gh CLI 脱却 (`mergeStateStatus` 取得経路を REST 直叩きに変える) (= #247 で別途)
- multi-base branch (= base が複数ある場合の挙動) — 現状 1 base 前提を維持
- conflict 自動解決 (= rebase --auto / merge strategy 変更等)
- mergeStateStatus API 自体への retry 戦略変更

## 受け入れ基準

- [ ] `src/core/finish/local-conflict-check.ts` が新設され `runLocalConflictCheck()` を export している
- [ ] `runPhase0LocalConflictCheck()` が `runPreflight()` の直後 / `runPhase1Archive()` の前に挿入されている
- [ ] conflict 検出時に Phase 1 archive が走らず、`{ exitCode: 1, escalation }` が return される (job state は変更されない)
- [ ] conflict escalation 後に `specrunner finish <slug>` を再実行できること (= `assertJobFinishable` で block されないこと)
- [ ] escalation message に conflict path 一覧と recovery 手順 (`git rebase origin/<base>` + `specrunner finish <slug>` 再実行) が含まれる
- [ ] `git fetch` 失敗時は silent skip せず escalation する
- [ ] mergeStateStatus check (Phase 0 既存ロジック) と直列に動き、いずれかが fail で Phase 1 に進まない
- [ ] 新規 unit test と integration test (上記 6 項) が pass
- [ ] 既存 Phase 0/1/2/3 関連 test が regression していない
- [ ] `bun run typecheck && bun run test` が green
- [ ] 該当 spec capability が MODIFIED で更新されている (or 新規 capability が ADDED されている)

## Workflow Options

- enabled: []
