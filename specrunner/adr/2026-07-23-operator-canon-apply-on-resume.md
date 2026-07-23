# ADR-20260723: resume を保護正典の operator 適用入口として設計する — `--apply-canon` フラグによる明示的帰属ゲート

**Date**: 2026-07-23
**Status**: accepted

Extends: [ADR-20260722-pipeline-sole-committer](2026-07-22-pipeline-sole-committer.md)
Extends: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md)
Follows: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)

## Context

ADR-20260723（canon-finding-escalation-routing）は、保護正典への fixable finding を
`CANON_FINDING_ESCALATION` として `awaiting-resume` に落とす routing を確立した。hint は
「保護正典を手動修正して `job resume` で再開せよ」と案内するが、**resume 入口に operator
変更を取り込む機構が存在しない**ため、この案内が機械的に失敗する 2 経路が残っていた。

### 失敗経路

**経路 1: commit なしで resume**  
operator が worktree を直接編集して `job resume` すると、再開 step の `commitAndPush`（guarded
mode）が `git status --porcelain` で dirty な保護正典を検出し、`findWriteScopeViolations` で
境界外変更として扱い quarantine + restore（= **operator 編集の破棄**）+ `WRITE_SCOPE_VIOLATION`
halt する。ADR-20260721 D4 の fail-closed 規則が正しく動作した結果だが、その先の
operator 適用フローが設計されていなかった。

**経路 2: commit のみして resume（push なし）**  
operator が手動 commit して resume すると、egress backstop が `rev-list HEAD --not --remotes=origin`
でその commit を検出し、`synthesizedCommits` 台帳に OID が無いため `EGRESS_UNKNOWN_COMMIT`
halt する。ADR-20260722 D4 の backstop が正しく動作した結果であり、台帳未登録の commit が
push に至らないことを保証したが、operator 適用 commit を台帳に登録する経路が存在しなかった。

**現状動作する唯一の経路**は「編集 → commit → **手動 push** → resume」だが、この経路は
どこにも文書化されておらず、hint は手順を省いた案内を行っていた。

### 問題の本質

write-scope 機械強制（#883）と egress backstop（#893）の両機構は正しく機能している。
**gap は resume 入口**にあり、operator 適用という帰属確定行為のための第一級インターフェース
が設計されていないことが原因。

### 参照: 既確立の不変条件

- ADR-20260722 D4: `synthesizedCommits` 台帳に登録された commit のみが push を通過できる。
  「台帳 = pipeline が構成した commit」が意味論。
- ADR-20260721 D4: 広域 write step の commit 前 `git status` 失敗は fail-closed（throw）。
- ADR-20260722 D5: 合成・復帰経路の git 操作失敗を黙殺せず halt。

## Decision

### D1: `--apply-canon` フラグによる明示的 operator 帰属ゲート

`job resume <slug> --apply-canon` を追加する。指定時、`ResumeCommand.prepare()` は step を
開始する前に保護正典パスの dirty 変更を commit として取り込み、OID を `synthesizedCommits`
台帳に登録してから step を再開する。

**採用理由**: resume 入口で dirty な保護正典を**無条件に operator 帰属**で自動 commit すると、
crash した step の agent 改変が台帳へ洗浄される窓になる。ADR-20260722 D4 の「台帳 =
pipeline が構成した commit」の意味論を守るため、帰属は operator の明示宣言（flag）によって
のみ成立させる。flag = "I, the operator, intentionally applied these changes."

**却下案**:
- *resume 時に dirty 正典を自動 commit*: crash 経路で残った agent 改変が台帳に入る帰属
  laundering リスク。`synthesizedCommits` の意味論を壊す。却下。
- *crash residue と operator 編集を snapshot 比較で識別し自動取り込み*: crash / kill 経路で
  snapshot 自体の信頼性が崩れる（ADR-20260722 D5 の fail-closed 原則に反する）。却下。

### D2: flag なし resume で dirty canon → fail-closed 停止

`--apply-canon` なしで resume し、保護正典パスに dirty 変更がある場合、`prepare()` は step を
開始せず exit code 1 で停止し、「`--apply-canon` で operator 適用 commit として取り込むか、
変更を破棄してから resume する」旨を stderr に出力する。

現行の無言破棄（worktree の変更を restore で捨てて continue）を廃止する。

**採用理由**: operator が手動編集した内容を黙って破棄することは最悪の UX であり、操作の
失敗が観測できない。fail-closed にすることで operator に明示的選択を要求し、
「破棄か取り込みか」の意思決定を operator に委ねる。

**却下案**:
- *警告して step を開始する*: write-scope 残余検査で確実に halt するため、警告は deferred
  halt になるだけで回避不能。エラーメッセージも read しにくい。却下。

### D3: 専用モジュール `src/core/resume/apply-canon.ts` にカプセル化する

保護正典 dirty 検出と commit の実装を `src/core/resume/apply-canon.ts` に分離する。

- `detectCanonDirtyPaths(slug, worktreePath, spawnFn)`: `git status --porcelain -z --no-renames
  -- <protectedCanonPaths>` を明示 pathspec で呼び出し、dirty な保護正典パスを返す。
  **git status 失敗は throw（fail-closed）**。ADR-20260721 D5 の「git 操作失敗を黙殺しない」と
  ADR-20260722 D5 の fail-closed 規則に従う。
- `commitOperatorCanon(slug, worktreePath, paths, spawnFn)`: 指定 paths を `git add -A` で
  ステージし `operator-apply: <slug>` メッセージで commit し、新 HEAD の OID を返す。

`git add -A` を採用する理由: scoped step の残余検査（`getWorktreeChangedPaths worktreeOnly=true`）
は untracked ファイル（Y='?'）を `paths` に含めるため、`git add -- <canon-paths>` のみでは
非正典の未追跡ファイルが `findScopedCommitViolations` の `WRITE_SCOPE_VIOLATION` を誤発火する。
`git add -A` で先に全 worktree をステージすると staged-only（Y=' '）となり `worktreeOnly`
フィルタで除外され、保護正典のみの commit として確定できる。

**採用理由**: `resume.ts` から分離することで、独立した unit テスト面を得られ、`prepare()` の
読みやすさを保てる。`protectedCanonPaths` を `write-scope.ts` から import するのは
domain→domain import で architecture 準拠。

### D4: OID を `synthesizedCommits` に登録してから step を開始する

`commitOperatorCanon` が返した OID を `appendSynthesizedCommit(state, oid)` で台帳に追記し、
`JobStateStore.persist()` で永続化した**後**に step を開始する。

egress backstop（ADR-20260722 D4）は push 前に台帳を参照する。OID が台帳に存在しなければ
`EGRESS_UNKNOWN_COMMIT` になるため、persist は step 開始前の必須ステップ。

**採用理由**: `appendSynthesizedCommit` は pure・冪等のため、crash 後の retry も安全。
step 開始前に完了させることで「台帳登録 → step 実行 → push」の順序不変を保証する。

**却下案**:
- *step 完了後に OID を登録*: egress 照合が `commitAndPush` 内で走るため、step 開始時には
  OID が台帳になければならない。却下。

### D5: commit message と pathspec による帰属の透明性

operator commit のメッセージは `operator-apply: <slug>` とし、`git log` で帰属が一意に判別できる。
コミット対象は検出した保護正典パスのみ（非正典 dirty は worktree に残す）。

### D6: worktree が利用不能な場合は `--apply-canon` を無視して継続する

`resolvedWorktreePath` が null（`--no-worktree` モードまたは worktree 未解決）の場合、
dirty 検査をスキップし `--apply-canon` は無効として警告を出力して step を継続する。
`--no-worktree` モードは worktree 状態を持たず、既存挙動保存が優先される。

### D7: split-brain 回復 — persist 失敗時は commit を巻き戻す

`commitOperatorCanon` 成功後に `runStore.persist()` が失敗した場合:

1. `git reset --mixed HEAD~1` で operator-apply commit を worktree に戻す。
2. reset が成功した場合: 「operator の正典編集は dirty として worktree に残ります、
   再度 `--apply-canon` で再試行できます」旨を案内して exit 1。
3. reset も失敗した二重障害時のみ: 手動 push による回復手順（`git push origin HEAD`
   および state に OID を手動追記する方法）を明示してエラー終了する。

**採用理由**: commit が git 歴史にのみ存在し台帳に未登録の状態は、次回 resume が
「正典 clean = 問題なし」と判定して step を開始し、egress 照合で `EGRESS_UNKNOWN_COMMIT`
halt する。これは本 request が廃止しようとした「手動 push が必要な状態」への逆戻り。
巻き戻しで一貫した初期状態に戻すことで再試行可能にする。

### D8: hint / escalation reason を `--apply-canon` に更新する

`commit-orchestrator.ts` の `CANON_FINDING_ESCALATION` hint と
`buildCanonEscalationReason` の出力を「保護正典を修正 → `job resume <slug> --apply-canon`」
に更新し、`git commit` / `git push` の手動手順を案内する文言を削除する。

## Alternatives Considered

### A1: hint の文言修正のみ（手動 commit + push 手順を正しく案内する）

現状動作する「編集 → commit → 手動 push → resume」を正確に文書化する案。

- **Pros**: コード変更が最小。
- **Cons**: git 内部運用（push のタイミング・必要性）の tribal knowledge を外部利用者に
  要求し続ける。push 忘れ → `EGRESS_UNKNOWN_COMMIT` halt の誤操作余地が残る。
- **Why not**: resume を operator 適用の第一級入口として設計し直す方が、操作の意図と
  機械の挙動を一致させる。hint 修正は回避策の文書化に過ぎない。

### A2: write-scope 検査側で「step 開始前 dirty」を自動識別して免除する

commit-push.ts で step 開始前 snapshot を取り、step 自身の書込とのみ差分を取る案。

- **Pros**: operator が commit を意識せずに済む。
- **Cons**: crash / kill 経路では step 開始前 snapshot 自体の信頼性が崩れる。snapshot に
  agent 改変が混入していた場合、そのまま免除されて台帳に入ることになり、D1 の帰属
  laundering 問題と等価。ADR-20260722 D5 の fail-closed 原則にも反する。
- **Why not**: 取り込みを resume 入口の明示操作に一本化する方が設計の一貫性が高い。

### A3: 保護正典の dirty 変更を flag なしで自動コミットする（全 resume に一律適用）

`--apply-canon` フラグを設けず、resume 入口で dirty な保護正典パスを検出した時点で
常に自動コミットして台帳に登録してから step を開始する案。

- **Pros**: operator が flag を覚える必要がない。操作が `job resume <slug>` のみで完結する。
- **Cons**: crash した step の agent が正典パスを書き換えた状態で異常終了した場合、
  次の resume でその agent 改変が operator 帰属として台帳に登録される。
  `synthesizedCommits` 台帳は「pipeline が構成した commit」という意味論（ADR-20260722 D4）を
  持つが、agent 著作物が無宣言で台帳に混入する（帰属 laundering）。
  commit message に `operator-apply` と書かれていても、operator が意図していない改変が
  歴史に残ることになる。
- **Why not**: 帰属は「operator が flag で明示的に引き受けた場合のみ」成立させる。
  resume 入口の dirty 正典が operator 適用なのか crash 残留なのかを機械は区別できず、
  operator の明示宣言を唯一の確実な識別根拠とする。auto-commit は識別不能な状態で
  帰属を決定してしまい、台帳の信頼性を損なう。

## Consequences

### Positive

- `CANON_FINDING_ESCALATION` から「保護正典を手動修正 → `job resume <slug> --apply-canon`」
  という一本道の回復フローが確立され、tribal knowledge の git 手順が不要になる。
- resume 入口の dirty 正典 = operator 適用の意図が flag で明示されるため、
  `synthesizedCommits` 台帳の「pipeline が構成した commit」の意味論が resume 経路でも保たれる。
- 無言破棄（従来の restore + halt）が廃止され、operator 作業の損失が不可視のまま発生しなくなる。
- egress backstop との衝突が解消され、operator 適用 commit が `EGRESS_UNKNOWN_COMMIT` に
  なる経路が封鎖される（mado-os 実発現 #903 の再発防止）。

### Negative

- operator が `--apply-canon` を worktree の dirty 状態と無関係に使用した場合、
  意図しないファイルが operator-apply commit に入るリスクはあるが、explicit pathspec
  （保護正典パスのみ）で scope が限定されるため影響範囲は制限される。
- flag なし resume で dirty 正典がある場合、以前は（無言で破棄後に）step が起動していたが、
  今後は exit 1 で停止するためスクリプト等からの自動 resume が中断する。
  これは意図的な fail-closed であり、破棄なのか取り込みなのかの選択を要求する正しい挙動。

### Known Debt

- `detectCanonDirtyPaths` の exit 128 carve-out（非 git ディレクトリを clean 扱い）は
  `prepare()` 内で明示的に catch するが、unit テストでの挙動明文化が review-feedback-001 F-001
  として記録されており、`resume-apply-canon.test.ts` への追加が望ましい。
- TC-016（`--apply-canon` + `noWorktree: true` で warning パス）のテストケースで
  `applyCanon: true` が欠落しており warning 分岐が未到達になっている（review-feedback-001 F-002）。
  テストの修正が未完了。
- managed runtime における同等フロー（canon escalation 後の reload 検証等）は本 request の
  スコープ外。別 request 系列で対処する。

## References

- Request: `specrunner/changes/operator-canon-apply-on-resume/request.md`
- Design: `specrunner/changes/operator-canon-apply-on-resume/design.md`
- Spec: `specrunner/changes/operator-canon-apply-on-resume/spec.md`
- Implementation: `src/core/resume/apply-canon.ts` / `src/core/command/resume.ts` /
  `src/cli/command-registry.ts` / `src/core/step/canon-escalation.ts` /
  `src/core/step/commit-orchestrator.ts`
- Related: [ADR-20260722-pipeline-sole-committer](2026-07-22-pipeline-sole-committer.md)
  — `synthesizedCommits` 台帳の意味論（本 ADR が resume 経路に一貫して適用）
- Related: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md)
  — write-scope 機械強制（本 ADR が解消しようとした resume との衝突の正確な記述）
- Related: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)
  — CANON_FINDING_ESCALATION の routing 基盤（本 ADR が resume 入口を補完）
- Issue: mado-os #903（実発現: operator 編集が退避・破棄された事例）
