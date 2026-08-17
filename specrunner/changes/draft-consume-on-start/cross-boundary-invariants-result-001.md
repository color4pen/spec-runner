# Cross-Boundary Invariants Review — draft-consume-on-start — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した主要ファイル

| ファイル | 確認内容 |
|---------|---------|
| `src/core/artifact/copy-artifacts.ts` | `consumeDraft` の実装・ループ対象・git-tracked 判定・エラー握り |
| `src/core/runtime/workspace-materializer.ts` | new-run arm の呼び出し位置（commit 成立後）・resume arm からの削除 |
| `src/core/runtime/local.ts` | no-worktree run path の位置・`isRunPath` 条件 |
| `src/core/runtime/managed.ts` | run path の位置（push 成功後）・git add 失敗ハンドリング |
| `src/core/resume/resolve-request-path.ts` | `resolveRequestPath` のフォールバック条件との相互作用 |
| `src/core/cancel/runner.ts` | `cancel --restore-draft` 経路が draft 消費後も正常動作するか |
| `src/core/archive/orchestrator.ts` | backstop が挙動無変更か |
| `src/core/inbox/run-inbox.ts` | inbox → writeDraft → start 経路での消費の一貫性 |
| `src/util/paths.ts` | `draftsDir()` が返す相対パスの正確性 |

---

## D1 順序契約（commit 成立前に失敗 → draft 残存）の確認

各 runtime path で `consumeDraft` の呼び出し位置がコード上の throw より後にあることを追跡した。

| Runtime | `consumeDraft` 前に throw する処理 |
|---------|-----------------------------------|
| workspace-materializer new-run | git add 失敗 → cleanup+throw / git commit 失敗 → cleanup+throw / git rev-parse 失敗 → cleanup+throw / appendSynthesizedCommit 失敗 → throw |
| local.ts no-worktree run path | git add 失敗 → throw / git commit 失敗 → throw / git rev-parse 失敗 → throw / appendSynthesizedCommit 失敗 → throw |
| managed.ts run path | git checkout -b 失敗 → throw / git push(branch) 失敗 → throw / **git add 失敗 → 警告のみ（後述 F-001）** / git commit 失敗 → throw / git rev-parse 失敗 → throw / git push(commit) 失敗 → throw |

**managed.ts を除いて** D1「削除は commit 成立後のみ」は構造的に保証されている。

---

## `resolveRequestPath` との相互作用

`resolveRequestPath`（`src/core/resume/resolve-request-path.ts`）は `state.request.path` が `/specrunner/drafts/` を含む場合のみ change-folder へフォールバックする。本変更後、`state.request.path` は常に change-folder の絶対パスになる（変更前も同様）。フォールバックは legacy jobs（変更前の状態から走行中のもの）向けに残り、新規 job では `statePath.includes("/specrunner/drafts/")` が false → as-is 返却となる。この動作は変更前後で同一であり、本変更が `resolveRequestPath` の不変条件を破ることはない。

---

## cancel --restore-draft との相互作用

`cancel/runner.ts:154-165` の構造:
1. `sourcePath = worktree/changes/<slug>/request.md` を読む
2. `destPath = repoRoot/specrunner/drafts/<slug>/request.md` を確認
3. `fs.access(destPath)` が成功（draft 存在）→ 「skipping restore」警告で no-op
4. `fs.access(destPath)` が失敗（draft 不在）→ 復元実行

消費後は draft が不在 → step 4 が実行される。「draft already exists; skipping restore」が通常経路にならなくなり、設計意図通りに動作する。✅

---

## archive backstop との相互作用

`orchestrator.ts:263-279` は `fs.exists(absPath)` で存在確認し、不在の場合は `continue`（no-op）。消費後は flat / directory いずれも存在しないため、archive の draft cleanup は no-op になる。TC-008 test で実機確認済み。✅

---

## inbox → start 経路との相互作用

`run-inbox.ts:397-400` は `writeDraft(repoRoot, slug, ...)` で `specrunner/drafts/<slug>/request.md`（directory 形式）を書いてから `runRunCore(draftPath, ...)` を呼ぶ。`draftPath` は canonical directory 形式なので、start 成功後に `consumeDraft` が `specrunner/drafts/<slug>/` を検出・削除する。整合している。

TC-011（inbox integration test）は "should" 優先度で未実装だが、`consumeDraft` 自体の unit test（TC-001〜009）でカバーされており許容範囲内。

---

## Findings

### F-001: managed.ts の git add 失敗が non-throwing — 理論上の消費窓

**ファイル**: `src/core/runtime/managed.ts`  
**行**: 214-218

managed.ts において git add 失敗は警告のみで続行する（workspace-materializer / local.ts は throw）。`git commit -m ... -- <pathspec>` はステージされた変更がないと exit code 1 を返すため、実際には commit 失敗 → throw → consumeDraft 未到達となる。よって D1 契約は実際には破られない。ただし、この非対称なエラーハンドリングは他の runtime path と一致しておらず、「git add 失敗 → commit 失敗 → throw」という二段階の防御に頼っている。

**実害リスク**: 非常に低い（`git commit --pathspec` は staged なしで必ず失敗する）。  
**影響**: pre-existing の非対称性であり、本変更は新規導入していない。

---

### F-002: 非 canonical requestFilePath + 同 slug の canonical draft 共存 → 意図しない消費（設計前提の暗黙違反）

**ファイル**: `src/core/artifact/copy-artifacts.ts`（consumeDraft）、`src/core/runtime/workspace-materializer.ts`（呼び出し元）  
**行**: 147-174（consumeDraft 本体）

**問題**: `consumeDraft` は slug の canonical 位置（flat / directory 両形式）を削除対象として決定し、`requestFilePath` が canonical かどうかを判定しない（D2 の設計決定）。D2 は「canonical 位置以外で起動した場合、canonical 位置は空」という暗黙前提に依存している。

この前提が破れるケースが存在する:

- ユーザーが `specrunner run /tmp/my-request.md` で slug `foo` のジョブを起動
- `specrunner/drafts/foo/` が同名 slug の別ドラフトとして既に存在
- start 成功 → `consumeDraft` が `specrunner/drafts/foo/` を発見 → 削除

`/tmp/my-request.md`（非 canonical ファイル）は消費されないが（仕様通り）、`specrunner/drafts/foo/`（canonical draft）は消費される。これは spec scenario 5 の GIVEN「no canonical draft exists for the slug」が成立しない状況であり、仕様はこのケースを規定していない。

**影響**: 
- canonical draft が無言で削除される（データロス）
- `cancel --restore-draft` 後のドラフト内容は、change-folder の request.md（＝コピーされた非 canonical ファイル）になる（元の canonical draft 内容は失われる）

**spec との照合**: spec scenario 5 は GIVEN を `no canonical draft exists` と明示しており、技術的には spec 違反ではない。しかし実際の運用では draft と non-canonical file が同一 slug で共存しうる（マニュアル試験、CI 環境等）。

**修正案**: 呼び出し前に `requestFilePath` が canonical 位置（`specrunner/drafts/<slug>.md` または `specrunner/drafts/<slug>/request.md`）かを確認し、非 canonical の場合は `consumeDraft` をスキップするか警告を加える。あるいは `consumeDraft` 内で canonical draft を消費する際に debug ログを追加する。

---

## 検証できなかった項目

| 項目 | 理由 |
|------|------|
| TC-011（inbox integration test） | should 優先度・差分に含まれず |
| appendSynthesizedCommit 失敗時に draft 残存することの明示的なテスト | R2 test は reject を確認するが draft 残存は未アサート（実装上は到達不可でありリスクは低い） |

---

## 検証サマリー

| 観点 | 結果 |
|------|------|
| D1 順序契約（commit 成立後のみ消費） | ✅ managed git add 非対称を除き構造的に保証 |
| resume 経路からの recopy 除去 | ✅ 全 4 箇所から削除済み（TC-012 gate pass 確認済み） |
| resolveRequestPath との相互作用 | ✅ 不変条件は変更前後で同一 |
| cancel --restore-draft の意味回復 | ✅ draft 消費後に skip せず復元実行される |
| archive backstop の挙動無変更 | ✅ orchestrator.ts 未編集・TC-008 で no-op 確認 |
| inbox → start 経路 | ✅ canonical directory 形式で整合 |
| typecheck && test | ✅ all 11755 tests passed |
