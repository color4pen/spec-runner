# Tasks: remote checkpoint publish / attach correctness closure

実装順は依存順（低リスクの consumer 側 → producer 配線 → doc → テスト）。各 task は独立の Acceptance
Criteria を持つ。テストは interface 確定後に書く（scenario は spec.md、code は本 tasks で確定）。設計判断の
正典は本 change の design.md（D1–D6）と ADR-20260715。

---

## T-01: attach で checkpoint commit OID を一度だけ解決し read/verify/materialize に貫かせる（D1 / D2）

`src/core/attach/orchestrator.ts`:

- [ ] `git fetch origin <branch>` 成功後、`git rev-parse origin/<branch>^{commit}` で checkpoint の commit OID を
  一度だけ解決する。exitCode ≠ 0 なら `checkpointNotFoundError(branch, detail)` で拒否する。
- [ ] `readCheckpointFromRef(spawnFn, cwd, <checkpointOid>)` を、symbolic `origin/<branch>` ではなく解決した OID で
  呼ぶ（`readCheckpointFromRef` のシグネチャは変えない。ref 文字列として OID を渡す）。
- [ ] `verifyCheckpoint({ ..., checkpointOid })` に OID を渡す。

`src/core/attach/verify-checkpoint.ts`:

- [ ] `verifyCheckpoint` の入力に `checkpointOid: string` を加え、`VerifiedCheckpoint` に `checkpointOid` を
  透過させる（検証ロジックは OID を identity 検査に使わない —— 透過のみ。既存検査は不変）。

`src/cli/attach.ts`:

- [ ] materialize 時の `attachCheckpoint.checkpointRef` を `origin/${verified.branch}` から
  `verified.checkpointOid` に変える。

**Acceptance Criteria**:
- `runAttachVerification` が fetch 直後に OID を一度だけ解決し、read/verify に同一 OID を渡す。
- `VerifiedCheckpoint` に `checkpointOid` が含まれる。
- CLI の materialize が `verified.checkpointOid` を `checkpointRef` に渡す。
- `bun run typecheck` が green。

---

## T-02: materialize が検証済み OID を exact checkout する（D2）

`src/core/runtime/workspace-materializer.ts`（`attach-from-checkpoint` plan）:

- [ ] `plan.checkpointRef`（= 検証済み OID）を `manager.create(host.cwd, slug, jobId, plan.checkpointRef, plan.branchName, setupPlan)` の
  baseRef として渡す既存経路を、OID が渡る前提で確認する（`checkpointRef` が OID になることで worktree と
  `-b <branch>` local branch がその exact commit に作られる）。追加の ref 再評価を行わないことを保証する。

**Acceptance Criteria**:
- attach-from-checkpoint の worktree / local branch が渡された OID の commit から作られる。
- `origin/<branch>` を materialize フェーズで再評価しない。
- `bun run typecheck` が green。

---

## T-03: checkpoint 述語を D2 まで閉じる（D3）

`src/core/attach/verify-checkpoint.ts`（既存の検証順を保存し追加検査を挿す。すべて
`checkpointNotAttachableError(reason, detail)` で拒否、ローカル状態を作らない pure 述語のまま）:

- [ ] **(b) version 2 で events.jsonl 必須**: raw `state.json` の `version`（正規化前）を parse し、`2` の場合、
  `treeFiles` に `slugEventsPath(slug)` が含まれなければ reason `events-missing` で拒否する。legacy version 1 は
  従来どおり欠落許容。
- [ ] **(c) counter reversal 検査**: raw `state.json` の `_journal`（`{ historyCount, stepCounts }`）を安全に
  parse し、`eventsJsonl` を `fold` して `detectCounterReversal(stored, foldResult)` を評価。reversal ≠ null なら
  reason `counter-reversal` で拒否する（`journal-integrity.ts` に content ベースの共用 helper を切り出して
  `inspectJournalDir` と共用してもよい。`composeSplitLayoutFromContent` は変えない）。
- [ ] **(d) resume step の reads() 必須入力を tree 検査**: 既存の `resolveResumeStep(...)` 呼び出しで解決した
  step 名を、`getPipelineDescriptor(getPipelineId(state)).steps` の静的集合から引き当てる。見つかり `reads` が
  ある場合、最小 `StepDeps`（`slug` を持つ context）で `step.reads(state, deps)` を評価し、`required !== false`
  かつ `artifact !== "gitState"` の各 file path が `treeFiles` に含まれなければ reason `resume-input-missing` で
  拒否する。descriptor 静的集合に無い動的 step（coordinator / regression-gate 等）は tree-precheck を skip する。
- [ ] **(a) quiescent 表現の統一**: 既存の `status !== "awaiting-resume"` 検査は維持し、コメント（`not-quiescent`
  近傍）の「quiescent」表現を「現在は `awaiting-resume` のみ」に統一する。

**Acceptance Criteria**:
- v2 で `events.jsonl` 欠落 → `CHECKPOINT_NOT_ATTACHABLE`。
- counter reversal → `CHECKPOINT_NOT_ATTACHABLE`。
- resume step の `reads()` 必須 file 入力欠落 → `CHECKPOINT_NOT_ATTACHABLE`。
- 3 つとも `verifyCheckpoint` が throw のみで、job state / worktree / sidecar を一切生成しない。
- 標準 pipeline の全 step の `reads()` が `state` と `deps.slug` のみを参照する不変を実装コメントで明示する。
- 既存 `verify-checkpoint` の通過テストが無変更で green（正常 checkpoint は従来どおり通過）。
- `bun run typecheck` が green。

---

## T-04: materialize は「作成を証明できる branch」のみ掃除する（D4）

`src/core/worktree/manager.ts`:

- [ ] `WorktreeManager.create` に「呼び出し前に branch が既存だったか」を表す明示 optional 引数を追加する
  （既定＝「manager が作成した＝掃除可能」。new-run は引数を渡さず現行挙動を維持する）。
- [ ] 失敗時の cleanup（`git branch -D <branchName>`）を、branch が既存でなかった（＝この呼び出しが作成した）
  場合のみに条件付ける。new-run 経路には git 呼び出しを追加しない（既存 spawn シーケンス不変）。

`src/core/runtime/workspace-materializer.ts`（`attach-from-checkpoint` plan）:

- [ ] `manager.create` を呼ぶ前に `git rev-parse --verify --quiet refs/heads/<branch>` で local branch の存在を
  確認し、既存なら「掃除しない」情報を `create` に渡す。既存なら worktree add 失敗時も削除しない。

**Acceptance Criteria**:
- attach 前から存在した local branch は attach 失敗後も削除されない。
- attach が作成した（呼び出し前に非存在の）branch は失敗時に掃除される。
- new-run の自己作成 branch cleanup（`manager.test.ts` の該当ケース）はテスト無変更で green。
- `bun run typecheck` が green。

---

## T-05: quiescent checkpoint publisher を単一 seam に集約する（D5）

`src/core/step/commit-push.ts`:

- [ ] `commitFinalState({ cwd, branch, slug, spawnFn })` に optional `messageLabel?: string`（既定 `finalize`）を
  加え、commit message を `${messageLabel}: ${slug}` にする。既定維持で既存挙動不変。

`src/core/runtime/local.ts`（`LocalRuntime.commitFinalState`）:

- [ ] `state.status` から `messageLabel` を導出する（`awaiting-resume` → `checkpoint`、それ以外 → `finalize`）。
  primitive へ渡す。throw しない契約は不変。

`src/core/pipeline/pipeline.ts`（`runInternal` の `while` ループ末尾、`notifyJobTerminal` の直前）:

- [ ] `state.status === "awaiting-resume"` のとき `await deps.runtimeStrategy?.commitFinalState(deps, state)` を
  呼ぶ（単一 seam。escalation / exhaustion / commitHalt 個別へは commit/push を追加しない）。既存の
  awaiting-archive publish（transition 直後の `commitFinalState`）は据え置く。
- [ ] `run()` 外側 catch（安全網）には publish を追加しない。

**Acceptance Criteria**:
- 制御された `awaiting-resume` 出口（escalation / exhaustion / guard halt）で、local persist の後に単一 commit が
  origin へ push される。
- commit/push 失敗時も例外を投げず、local の `awaiting-resume` 状態は resumable のまま。
- awaiting-resume publish の呼び出し箇所は loop 末尾 seam の 1 箇所のみ（escalation / exhaustion / commitHalt に
  commit/push が散らばっていない）。
- `commit-final-state` の既存テストは無変更で green（既定 label `finalize`）。
- `bun run typecheck` が green。

---

## T-06: ADR Positive 文言と `ADR-20260715 D7` コードコメントを是正する（D6）

- [ ] `architecture/adr/2026-07-15-remote-checkpoint-reattachment-boundary.md` の「## 結果」Positive 文言を、
  publisher（本 behavior 実装）で cross-env resume が閉じる旨に是正する（divergence 解消）。CODEOWNERS 対象の
  編集である点に留意する。
- [ ] `src/core/attach/orchestrator.ts` と `src/cli/attach.ts` のコメント中 `ADR-20260715 D7`（存在しない番号）を、
  behavior 設計側（本 change の design.md D1–D2 / フロー節）への citation に差し替える。ADR への誤 citation を
  除去する。

**Acceptance Criteria**:
- ADR Positive 文言が publisher 完成後の事実と一致する。
- `src/` 配下に存在しない `ADR-20260715 D7` citation が残らない。
- `bun run typecheck` が green。

---

## T-07: consumer 側の挙動をテストで固定する（D1–D4）

interface 確定（T-01〜T-04）後に追加する。既存の behavior-preservation テストは無変更のまま。

- [ ] **OID 固定**（`tests/attach/`）: fetch 後に解決した OID が read/verify/materialize を貫くこと、`origin/<branch>` が
  検証後に別 commit へ動いても検証済み OID を materialize することを固定する（real-git harness or spawn stub）。
- [ ] **述語 closure**（`tests/attach/verify-checkpoint.test.ts` 系）: v2 で `events.jsonl` 欠落 → 拒否、
  counter reversal → 拒否、resume step の `reads()` 必須入力欠落 → 拒否を、それぞれ `CHECKPOINT_NOT_ATTACHABLE` で
  固定し、いずれも job state / worktree / sidecar を生成しないことを assert する。
- [ ] **branch 非破壊**（`tests/core/worktree/manager.test.ts` に新ケース追加、既存 TC は無改変）: 既存 branch
  （pre-existing 相当の情報）を渡した worktree add 失敗で `git branch -D` が呼ばれないこと、非存在 branch では
  従来どおり掃除されることを固定する。attach 経路（materializer）で既存 local branch（未 push commit 保持）が
  失敗後に残ることを固定する。

**Acceptance Criteria**:
- 上記 3 系のテストが green で、対応する受け入れ基準（OID 貫通 / 述語拒否 / branch 非破壊 / new-run 不変）を
  検証している。
- 既存 attach / commit / worktree 挙動保存テストが無変更で green。

---

## T-08: producer 側の publish をテストで固定する（D5）

- [ ] 制御された `awaiting-resume` 出口で checkpoint が commit+push されること、push 失敗時も local resume 可能で
  あることを固定する（pipeline 経由。stub agent runner ＋ spawn stub or real-git harness）。
- [ ] awaiting-resume publish が loop 末尾 seam の 1 箇所のみで起きること（escalation / exhaustion / commitHalt に
  散らばっていないこと）を、publish 回数の観測で固定する。

**Acceptance Criteria**:
- awaiting-resume publish のテストが green。
- push 失敗 → 例外なし・local resumable のテストが green。

---

## T-09: 主役 E2E —— publish → 同一 OID attach → resume を統合テストで固定する

`tests/attach/attach-integration.test.ts`（bare origin + clone の real-git harness を利用）:

- [ ] マシンA相当: 実際の pipeline（local runtime、stub agent runner）を `awaiting-resume` へ遷移させ、
  自己整合な checkpoint を bare origin へ publish する。
- [ ] マシンB相当: 別 clone で `runAttachVerification`（fetch → OID 解決 → 検証）→ materialize を行い、publish された
  commit と **同じ commit OID** を検証・materialize することを assert する。
- [ ] マシンB相当で `job resume` が resume step から pipeline を開始できることを固定する。

**Acceptance Criteria**:
- publish された checkpoint の commit OID とマシンB相当が materialize した commit OID が一致する。
- マシンB相当が attach 後に `job resume` を開始できる。
- 統合テストが green。

---

## T-10: 全体検証

- [ ] `bun run typecheck && bun run test` が green。
- [ ] 受け入れ基準（design.md「Acceptance との対応」節・spec.md 各 Requirement）を満たすことを確認する。
- [ ] 既存の attach / commit / worktree の挙動保存テストが無変更で green であることを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- request.md の全受け入れ基準が満たされている。
