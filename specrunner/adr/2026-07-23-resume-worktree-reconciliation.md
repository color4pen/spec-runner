# ADR-20260723: resume が worktree を機械的に後始末する — halt→resume 回復契約の確立

**Date**: 2026-07-23
**Status**: accepted

Extends: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)
Related: [ADR-20260722-pipeline-sole-committer](2026-07-22-pipeline-sole-committer.md)
Related: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md)

## Context

step 実行中の停止（write-scope violation halt / crash / process kill）は worktree に未コミットの
step 成果物を残すことがある。従来の `resume` はこの残骸を後始末しないため、次の step の
write-set 検査（ADR-20260721）が残骸を「当該 step の宣言外書込」として誤帰属し、
`WRITE_SCOPE_VIOLATION` halt を再生産する。operator が残骸を手動削除するまで自律的に前進できない。

**実発現例**: 中断された spec-review attempt が残した untracked な `spec-review-result-002.md`
が、resume 後の spec-review（iteration 003 を宣言）の write-set 検査で "Forbidden paths changed"
として halt を引き起こした。

### 現状コードの前提

- `src/core/command/resume.ts` — resume の dirty 検査は protected canon paths に限定されている
  （apply-canon gate、ADR-20260723-operator-canon-apply-on-resume）。非 canon の
  dirty / untracked ファイルは無検査で step 開始に進む。
- `src/core/step/commit-push.ts` — write-set 検査は pre-staged ファイルを除外するが、
  untracked / unstaged の残骸は除外されず `findWriteScopeViolations` → halt につながる。
- `src/core/step/commit-push.ts:53-79` — 違反内容を `.specrunner/local/<slug>/`（machine-local、
  commit されない）へ退避する quarantine 機構が既に存在する。
- `src/core/pipeline/round-git-scope.ts` — `pipelineManagedPaths(slug)` が change folder 配下の
  pipeline 管理パス集合（state.json / events.jsonl / usage.json 等）を定義している。

### 停止態様と cleanup 保証の非対称性

停止の態様（正常 halt / crash / kill）によらず、halt 側での cleanup 実行は保証されない。
「halt 側で cleanup を確実に実行する」という設計前提そのものが成立しない。後始末の責務は
resume 側に置くしかなく、resume を「一貫した開始状態を機械的に確立する単一回復点」として
設計することが唯一の正解である。

## Decision

### D1: resume を単一回復点とし、worktree reconcile を `prepare()` に配置する

`job resume` の `ResumeCommand.prepare()` に worktree reconcile を追加する。reconcile は
step 開始前に worktree の dirty / untracked パスを機械的に後始末し、前回停止の態様に
依存しない一貫した開始状態を確立する。

reconcile の実行タイミングは apply-canon gate の**後**（D6 参照）。`resolvedWorktreePath`
が null（`--no-worktree` モード）の場合は skip する（reconcile 対象の worktree が存在しない）。

**採用理由**: crash / kill では halt 側の実行が保証されない。resume は halt/crash/kill の
すべての停止態様が必ず通過する唯一の合流点であり、回復責務を resume 側に置くことで
「開始状態の一貫性」が停止態様に依存しない hard contract になる。

**却下案**:
- *halt 側での cleanup 追加*: crash / kill では実行されない。保証できない前提を設計根拠にしない。

### D2: dirty path の 3 クラス分類スキームと回復契約

worktree の dirty / untracked パスを次の 3 クラスに分類し、クラスごとに処理を固定する。

| Class | 分類述語 | 処理 | タイミング |
|---|---|---|---|
| **protected canon** | `path ∈ protectedCanonPaths(slug)` | **変更なし**: apply-canon gate（`--apply-canon` → operator-apply commit、未指定 → fail-closed 停止） | reconcile の**前**（既存 apply-canon gate） |
| **pipeline-managed artifact** | `path` が `changeFolderPath(slug)` 配下 かつ `path ∉ protectedCanonPaths(slug)` かつ `path ∉ pipelineManagedPaths(slug)` | **quarantine 退避 → 除去**。失敗時 → fail-closed 停止（除去しない） | apply-canon gate の後、step 開始前 |
| **非管理パス** | 上記以外（`changeFolderPath` 外、または `pipelineManagedPaths` 内） | **処理なし**（現状挙動を維持） | — |

この分類スキームは変更不可の回復契約である。新たな step artifact の種類が増えた場合も、
「`changeFolderPath` 配下かつ canon でも managed でもない」という述語で自動的に捕捉される。

**採用理由**: 分類述語を `pipelineManagedPaths` / `protectedCanonPaths` の既存集合から
導出することで、ファイル種別の列挙（drift する）を回避し、契約の完全性を保証する。

**却下案**:
- *非管理パス（src/ 等）への fail-closed 停止*: crash 途中の実装系 step の残骸のたびに
  operator 介入が必要になり、自律収束の目的に反する。
- *`*-result-*.md` 等のパターン列挙によるホワイトリスト*: 新 artifact 種別登場時に drift する。
  「changeFolderPath 配下 − canon − managed」の集合は完全かつ自己更新する。

### D3: pipeline state journal は非管理パスとして保護する

`state.json`、`events.jsonl`、`usage.json` は `pipelineManagedPaths` に含まれるため、
分類 Class 2（pipeline-managed artifact）には**該当しない**。reconcile 時点で `state.json` は
`prepare()` が直前に "running" 遷移を書き込んでおり dirty である。これを除去すると job 自体の
状態が破壊される。

**採用理由**: これらは「中断 attempt の step 成果物」ではなく「job の running state journal」である。
`pipelineManagedPaths` を「保護する keep set」として用いることで、状態 journal と step 残骸の
混同を設計レベルで防ぐ。

**却下案**:
- *changeFolderPath 配下のすべてを（canon 除き）reconcile 対象にする*: `state.json` の削除で
  job が自己破壊する。

### D4: quarantine-all-then-remove-all、quarantine 失敗は fail-closed

reconcile 対象パス群について、**全件の quarantine を完了してから**除去を開始する。

- quarantine: ファイル内容および `git diff HEAD -- <path>` の差分を
  `<worktree>/.specrunner/local/<slug>/reconcile-<ts>/` に書き出す（既存の sidecar 規約を再利用）。
- いずれかの quarantine が失敗した場合: **何も除去せずに throw**（fail-closed）。
  証拠保全の失敗は除去の許可を与えない。
- quarantine がすべて成功した後: 各パスを tracked 状態に応じて除去する（D5 参照）。

**採用理由**: 「除去は必ず退避を伴う」が設計不変条件。「全件先に退避してから除去」という
順序を徹底することで、「除去が始まった時点では全証拠が保存済み」が invariant として成立する。

**却下案**:
- *best-effort quarantine（失敗しても除去を続ける）*: `quarantineViolationEvidence` の設計と
  類似するが、あちらは halt を妨げない用途。ここでは証拠消失が除去を止める必要があるため
  fail-closed でなければならない。

### D5: 除去は tracked 状態で分岐する

untracked / staged-new / tracked 修正の 3 種に対して `commit-push.ts` の `restoreViolatedPaths`
と同一の分岐ロジックを使用する。

- **untracked** (`X='?' Y='?'`) → `git clean -f -- <path>`
- **staged-new** (`X='A'`) → `git rm --cached -- <path>` + `git clean -f -- <path>`
- **tracked / modified** → `git checkout HEAD -- <path>`

いずれも「HEAD の clean 状態」をそのパスに対して確立する。除去コマンドの失敗は throw（fail-closed）。

**採用理由**: `git checkout HEAD` は untracked / staged-new を復元できない。
既存の restore 分岐（commit-push.ts）と同一ロジックを採用することでコードの知識の二重化を防ぐ。

### D6: reconcile を apply-canon gate の後に配置する

reconcile 呼び出しは `if (resolvedWorktreePath !== null && resolvedSlug !== null)` ブロック内、
apply-canon gate の**直後**に追加する。

- `--from` フラグは `startStep` のみを変更し、このブロックをバイパスしない。
- `--apply-canon` 使用時: apply-canon が commit 後に制御を返し、続いて reconcile が走る。
- apply-canon gate が fail-close した場合（dirty canon、flag なし）: そこで停止し、
  reconcile に到達しない。これは bypass ではなく正当な停止。

**採用理由**: reconcile を gate の後に置くことで「canon の安全性確立が先」という順序を保ち、
apply-canon gate 自体（および既存テスト）を無変更に保てる。

**却下案**:
- *reconcile を apply-canon gate の前に配置*: 機能上の差異はないが、gate の early-exit / fail-closed
  が outer guard として機能する構造が失われる。

### D7: git status 検知失敗は best-effort no-op、quarantine/除去失敗は fail-closed

`reconcileWorktreeArtifacts` は `git status` の実行が失敗した場合（spawn 失敗 / 非 git
ディレクトリ等）に `{ reconciled: [], quarantineDir: null }` を返し no-op とする。
throw するのは「残骸を検知できたが quarantine / 除去できなかった」場合のみ。

**採用理由**: request が要求する fail-closed は「証拠消失」に対してである。canon 安全性は
apply-canon gate（D6）が先行して保護しており、reconcile の検知失敗の最悪ケースは
pre-feature 挙動（残骸 halt）への degradation であり regression ではない。検知失敗で throw すると、
非 git 環境（テスト/dev）や非実在 worktree での apply-canon gate テストを壊す（D6 参照）。

**却下案**:
- *`git status` 失敗も fail-closed（apply-canon と対称に）*: 既存の apply-canon gate テスト群が
  fake worktree パスを使用しており、reconcile が status 失敗で throw すると全テストが壊れる。
  また production で `git status` が失敗する時は step 自身の git 操作も失敗するため、
  no-op で step を起動する意味がない（step が起動後即 halt する）。

### D8: 新モジュール `src/core/resume/reconcile-worktree.ts` に封じ込める

reconcile を `src/core/resume/reconcile-worktree.ts` として `apply-canon.ts` / `resolve-step.ts`
と並置する専用モジュールに実装する。

- `isReconcilableArtifact(path, slug)`: 分類述語の pure 関数（Class 2 に属するか）。
- `reconcileWorktreeArtifacts(slug, worktreePath, spawnFn)`: dirty/untracked 列挙 → 分類 → 
  quarantine → 除去の I/O オーケストレータ。`ReconcileResult { reconciled, quarantineDir }` を返す。

`protectedCanonPaths` を `../step/write-scope.js` から、`pipelineManagedPaths` を
`../pipeline/round-git-scope.js` から import する（domain→domain、同一レイヤ、architecture 準拠）。

**採用理由**: `prepare()` の可読性を保ちつつ、分類述語を独立した unit テストで検証できる。
`pipelineManagedPaths` を再利用することで managed set の追加が自動的に "keep" セットに反映される。

**却下案**:
- *`prepare()` にインライン実装*: テスト困難、責務の混入。
- *固定ファイル名パターンの列挙*: 新 artifact 種別登場時に drift する。

## Alternatives Considered

### A1: write-set 検査側で「開始時点の既存 dirty パス」を除外する

step 開始前に dirty snapshot を取り、step 自身の書込とのみ差分を取って検査を緩和する案。

- **Pros**: resume 側の変更が不要。
- **Cons**: crash / kill 経路では snapshot の信頼性が崩れる。agent 改変が snapshot に混入すると
  そのまま免除されて合成 commit に乗る（sole-committer 汚染）。ADR-20260722 D5 の fail-closed
  原則に反する。
- **Why not**: 検査の緩和は fail-open 方向。evidence 消失は防げない。

### A2: 非管理パス（src/ 等）の dirt にも fail-closed 停止を適用する

crash 途中の実装系 step が残した `src/` 配下の未コミットファイルを残骸として除去する案。

- **Pros**: write-set 検査の誤帰属をより広くカバーできる。
- **Cons**: crash 途中の実装が operator の意図的な作業であるかを機械は識別できない。
  実装 step の途中成果物のたびに operator 介入が必要になり、自律収束の目的に反する。
- **Why not**: 非管理パスの dirt は「operator の作業中ファイル」として現状維持を contract に明文化する。

### A3: halt 側での cleanup を保証する（ signal handler / atexit 等）

kill/crash 時の cleanup を signal handler や atexit で保証し、halt 後の worktree を常に clean に保つ案。

- **Pros**: resume 側の reconcile が不要になる。
- **Cons**: SIGKILL はユーザー空間の signal handler を通過しない。OOM kill も同様。
  「kill で cleanup が保証される」という前提は成立しない。
- **Why not**: 保証できない前提を設計の根拠にしない。

### A4: reconcile を apply-canon gate の前に置く

apply-canon gate の手前に reconcile を差し込み、canon 処理より先に step artifact 残骸を除去する案。

- **Pros**: 実行順序の依存関係がなく、どちらを先にしても機能的には等価。
- **Cons**: apply-canon gate の early-exit / fail-closed が outer guard として機能する構造が失われる。
  gate が fail-close した場合に reconcile が先に走ることになり、「canon 安全性が先に確立される」
  という読みやすいモデルが崩れる。apply-canon gate の既存テスト構造にも触れる必要が生じる。
- **Why not**: 2 クラス（protected canon / pipeline-managed artifact）の分類述語は互いに素なので
  機能差異はないが、gate を outer guard として維持する構造の明快さと既存テストへの無変更を優先した。

### A5: `git status` 失敗も throw する（apply-canon と対称な fail-closed）

`reconcileWorktreeArtifacts` でも `detectCanonDirtyPaths` と同様に `git status` 失敗を throw し、
検知失敗もすべて fail-closed にする案。

- **Pros**: apply-canon gate と対称なセマンティクスになり、挙動の一貫性が高まる。
- **Cons**: 既存の apply-canon gate テスト群は fake worktree パスを使用して `prepare()` を直接
  ドライブしており、reconcile が `git status` 失敗で throw すると全テストが壊れる。
  また production で `git status` が失敗する環境は git 操作全般が機能しない壊れた環境であり、
  step 自身の git 操作も即座に失敗する。no-op で step を起動する意味がない。
- **Why not**: request が要求する fail-closed は「証拠消失」に対するものであり、検知失敗の
  最悪ケースは pre-feature 挙動（残骸 halt）への degradation に留まり regression ではない。
  canon-detection の fail-closed は「operator 作業の損失防止」が動機（apply-canon gate の設計）
  であり、reconcile の検知失敗とは動機が異なる。Evidence loss（quarantine / 除去の失敗）のみが
  fail-closed の対象である。

## Consequences

### Positive

- 中断 attempt の残骸が `WRITE_SCOPE_VIOLATION` を再生産するループが resume 時に機械的に断ち切られ、
  operator が手動削除しなくても自律的に前進できるようになる。
- quarantine により残骸の証拠が `.specrunner/local/<slug>/` に保全されるため、
  step が何を書き残したかを事後検証できる。
- 回復契約（3 クラス分類 × 処理 × タイミング）が `docs/operations.md` に明文化され、
  operator および将来の実装者が参照できる。
- 分類述語が `pipelineManagedPaths` / `protectedCanonPaths` の既存集合から動的に導出されるため、
  新 artifact 種別が追加されても classifier は drift しない。

### Negative

- reconcile は `changeFolderPath` 配下かつ canon でも managed でもないパスを**すべて**除去する。
  `rules.md` を operator が手動編集して resume した場合、黙って quarantine → 除去される
  （証拠は保全されるが変更は失われる）。`rules.md` を `protectedCanonPaths` に追加することで
  apply-canon gate で保護できるが、スコープ外（別 request 化推奨）。
- staged-new 除去パス（`git rm --cached` + `git clean -f`）に実 git テストがない（low リスク）。
  kill が `git add` と `git commit` の間で発生した場合にのみ発生し得る。

### Known Debt

- `rules.md` の分類が Class 2（reconcile 対象）であることを `docs/operations.md` の例示に
  明記するか、`protectedCanonPaths` へ追加するかは別 request で判断する。
- staged-new 除去パスの実 git テスト追加は軽微な作業で完結する（review-feedback-001 に記録）。

## References

- Request: `specrunner/changes/resume-worktree-reconciliation/request.md`
- Design: `specrunner/changes/resume-worktree-reconciliation/design.md`
- Spec: `specrunner/changes/resume-worktree-reconciliation/spec.md`
- Implementation: `src/core/resume/reconcile-worktree.ts` / `src/core/command/resume.ts`
- Docs: `docs/operations.md`（halt→resume 回復契約セクション）
- Related: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)
  — apply-canon gate（本 ADR の reconcile が gate の後に実行する）
- Related: [ADR-20260722-pipeline-sole-committer](2026-07-22-pipeline-sole-committer.md)
  — sole-committer 設計（残骸が合成 commit に乗ることを防ぐ動機）
- Related: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md)
  — write-set 検査（本 ADR が残骸の誤帰属経路を閉じる対象）
