# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md ↔ design.md 整合性

**gate 順序と三分岐設計（D1）**  
resume.ts:276-332 の apply-canon gate が最初に throw するため dirty canon があると reconcile に到達しない現行挙動を確認。D1 の三分岐（applyCanon 優先 / 部分出力判定成立 / fail-closed）配置は現行コードの `if/else if/else` 構造に自然に収まる。

**4 条件 AND の保守性（D2）**  
各条件を独立した歯として検証した:
- 条件 3（interruption 裏づけ）: `InterruptionRecord.reason` の型が `"timeout" | "signal" | "failure" | "exhaustion"` に厳密に限定されている（event-journal.ts:90-98）。escalation は interruption record を追記しない（job-state-projection.ts:75-85 でもそのまま materialize）ため reason gating で除外できる。
- 条件 4（完了 StepRun 不在）: signal 経路では exit-guard.ts が interruption 追記と遷移のみ行い StepRun を追加しない。timeout 経路では executor.ts:367-374 が `makeTimeoutHalt` を返し、`commitHalt`（commit-orchestrator.ts:506-542）が `recordFailedStepResult` → `pushStepResult` を呼ぶため StepRun が state.steps に追記される。design.md の表「timeout → 失敗 StepRun あり」は正確。SIGKILL / hard-crash では commitHalt が到達しないため StepRun 不在のまま。

**stale-running 経路**  
resume.ts:158-180 の isStaleRunning ブロック後に `staleRunningDetected` フラグを導入する設計は SIGKILL / hard-crash 経路（resumePoint 無し）を正しくカバーする。SIGKILL では beforeExit が走らず resumePoint が null になるが、フラグが条件 3 を独立して成立させる。

### 2. design.md 設計根拠の確認

**getPipelineDescriptor パターン**  
verify-checkpoint.ts:182-216 と同一の `getPipelineDescriptor(getPipelineId(state))` → `new Map(descriptor.steps).get(name)` パターンをすでに使用している。`declaredCanonWritesForStep` の実装根拠として有効。

**DesignStep.writes() の minimalDeps 要件**  
design.ts:135-143 の `writes()` は `deps.slug`（changeFolderPath）と `deps.request.type`（isSpecRequired）のみ参照する。T-03 が提案する `{ slug: resolvedSlug, request, config }` の minimalDeps はこの要件を満たす。

**protectedCanonPaths の内訳**  
write-scope.ts:64-74 で request.md / spec.md / design.md / tasks.md / test-cases.md / request-review-attestation.json の 6 件を確認。DesignStep.writes() は design.md / tasks.md / spec.md のみ宣言するため、宣言外の canon（test-cases.md 等）が dirty に混在した場合は条件 2 不成立 → fail-closed になる。

**isReconcilableArtifact の canon 除外規則**  
reconcile-worktree.ts:66-69 が rule 2 で protected canon path を明示除外している。新設の `quarantinePartialCanon` を apply-canon gate 内（reconcile より前段）に配置することで rule 2 を触れずに済む設計は責務分担を維持している。

**--apply-canon 優先性（D5）**  
resume.ts:295-331 の `if (options.applyCanon)` が最初の分岐として来ることを確認。新設の `else if` はその後ろに挿入される設計で意味論の変更なし。

### 3. spec.md 振る舞い記述の検証

8 つの Scenario（untracked / tracked-modified / 裏づけ無し halt / 混在 halt / 前 step 完了 halt / --apply-canon 優先 / 退避失敗 halt / stale 経路 / 冪等性）を確認。Given/When/Then の論理は設計の 4 条件 AND から正しく導出されており矛盾なし。各 Requirement に SHALL を含み spec 記法規律を満たす。

### 4. 受け入れ基準 ↔ tasks.md 対応確認

| 受け入れ基準 | 対応 task |
|---|---|
| untracked / tracked-modified で退避 + 除去 + 続行 | T-05 TC1, T-06 untracked/tracked case |
| 退避先に evidence が読める形で残る | T-06 |
| 裏づけ無し dirty → halt | T-05 TC2 |
| writes() 外 canon 混在 → halt | T-05 TC3 |
| --apply-canon 指定 → operator-apply commit | T-05 TC5 |
| 退避失敗 → 削除せず halt | T-05 TC6, T-06 fail-closed case |
| stale 経路 → 隔離続行 | T-05 TC7 |
| 隔離後再 resume が clean gate 通過（冪等性） | T-06 冪等性 case |
| typecheck && test green | T-07 |

### 5. セキュリティ観点（OWASP applicable）

**インジェクション**: `dirtyCanonPaths` は `detectCanonDirtyPaths` が固定 pathspec（`protectedCanonPaths(slug)` 由来、job state から導出）で git status を呼ぶ。外部入力が path 集合を拡張できる経路なし。

**パストラバーサル**: evidence ファイル名は `filePath.replace(/\//g, "__") + ".md"` で正規化される。git が管理する path に `..` は含まれず（git 正規化）、`pathJoin(quarantineDir, safeName)` によるディレクトリ脱出リスクなし（reconcile-worktree.ts:189 と同パターン）。

**operator 編集の誤消去**: 4 条件 AND と fail-closed デフォルトが安全弁。誤爆しても evidence は退避先に残り復元可能。

**隔離対象の境界**: `quarantinePartialCanon` は pathspec で対象を `dirtyCanonPaths` に限定するため、宣言外の dirty ファイルに触れない。

## 検証できなかった項目

**timeout の StepRun 追記経路（createSessionWithHistory 前の早期 timeout）**  
`commitHalt` → `recordFailedStepResult` → `pushStepResult` によって timeout が StepRun を追記することをコードで確認した。ただし、session 生成前（createSessionWithHistory の例外パス）でタイムアウトした場合に同経路を通るかどうかはトレース未完。設計は timeout 経路を fail-closed 許容として明示しており実害は低い。

**T-01 リファクタ後の git コマンド列不変**  
quarantine core 切り出し後の `reconcileWorktreeArtifacts` 外部挙動が既存テストで regression gate として機能するかは実装前の確認不可。設計が「既存 reconcile テスト群を無改変で green に保つことを歯とする」と明示しているため、実装者の判断に委ねる。

## Findings 詳細

### [LOW] T-05 に condition 1（startStep ≠ interruptedStep → halt）の TC が欠落

**対象**: `specrunner/changes/resume-partial-canon-quarantine/tasks.md`

spec.md の条件 1（`startStep === interruptedStep`）が不成立のケース（例: `--from spec-review` + dirty design canon）の TC が T-05 に存在しない。

ゲート配線では条件 1 が false なら else ブランチ（fail-closed halt）に落ちるため振る舞いは正しい。しかしこの分岐を固定するテストがないため、条件 1 チェックを削除しても T-05 が green のままになる。

**修正案**: T-05 に TC を追加する。  
「`--from` で別 step へ redirect（startStep ≠ state.step）かつ dirty canon = design writes → `quarantinePartialCanon` 未呼び出し、`PrepareError(1)` で halt」

---

### [LOW] T-04 AC が `isInterruptedStepPartialCanon` に 4 条件すべて含まれると誤読される

**対象**: `specrunner/changes/resume-partial-canon-quarantine/tasks.md`

T-04 の AC「isInterruptedStepPartialCanon: 全条件成立で true、各条件を 1 つ落とすと false」は spec.md の 4 条件全体をこの関数がカバーするように読める。しかし T-02 のシグネチャに `startStep` は含まれず、条件 1（startStep 一致）はゲート配線（T-03）で別途チェックされる。実装上の問題はないが、T-04 のテストを書く際に実装者が条件 1 をこの関数に含めるか迷うリスクがある。

**修正案**: T-04 AC を「`interruptionBacked && completedStepRunAbsent && 宣言一致` の 3 条件のいずれかが欠けると false」と明記し、「startStep 一致は gate 配線（T-03）で確認」と注記を加える。

---

### [LOW] `as unknown as StepDeps` キャストが compile-time 安全性を迂回する

**対象**: `specrunner/changes/resume-partial-canon-quarantine/tasks.md`

T-03 の `minimalDeps = { slug: resolvedSlug, request, config } as StepDeps` は verify-checkpoint.ts:213 と同パターンだが、型キャストが compile-time チェックを迂回する。現時点で design.writes() は `deps.slug` と `deps.request.type` のみ参照するため問題ない。将来 writes() が他フィールドを参照する変更が入った場合は runtime エラーになる可能性がある。

`declaredCanonWritesForStep` の try/catch（例外時 `[]` → fail-closed）が runtime 安全網になっているため実害は生じにくいが、tasks.md に「writes() が参照フィールドを拡張する場合は minimalDeps も同期すること」の注記を加えると将来の退行リスクが明示される。
