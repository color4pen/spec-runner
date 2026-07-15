# changed-files 導出失敗を fail-closed 化する（`listChangedFiles` を DU 化し「導出失敗」と「変更なし」を分離）

## Meta

- **type**: spec-change
- **slug**: changed-files-derivation-fail-closed
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

<!-- adr: 既存不変 scope-unevaluable-fail-closed（B-11 / dynamic-model.md:61 / components.md）の残余（runtime 導出失敗経路）を、既存の DU パターン（listWorktreeChanges）で閉じる refine。新しい port/pattern の導入ではない。§4 昇格 / ADR の要否は design step が評価する（escalation 可）。 -->

## 背景

`scope-unevaluable-fail-closed` 不変は「scope を検証できない runtime では fail-open を選ばず着手前に止める / UNKNOWN を合成する」ことを求める（`architecture/dynamic-model.md:61`、`architecture/components.md` の scope-check 不変、B-11）。この不変は **構造的に導出できない runtime**（`canDeriveChangedFiles() === false` ＝ managed）については封じられている。

しかし `RuntimeStrategy.listChangedFiles` は `git diff` の**実行時失敗（非ゼロ終了・throw）を `[]` に畳む**（`src/core/runtime/local.ts:695-710`、docstring「Never throws — returns [] on any error」）。`canDeriveChangedFiles()` は静的な能力宣言で LocalRuntime では常に `true` であり、**per-call の失敗を表さない**。その結果、導出能力のある runtime（local）で `git diff` が実行時に失敗すると `[]`＝「変更なし」と区別できず、scope-check と reviewer activation gate が **fail-open** で素通りする — 不変の意図（`fail-open に戻ることを封じる`、model.md:89 の B-11 rationale）に反する残余。

- scope-check（`src/core/step/scope-check.ts:55`）: 失敗 → `[]` → `deriveScopeBreach` が breach なしと判定 → forbidden surface を見逃す。
- reviewer activation gate（`src/core/step/executor.ts:274`）: 失敗 → `[]` → `evaluateActivation` が paths 条件付き reviewer を skip。

本 request は `listChangedFiles` を `listWorktreeChanges` と同型の DU に変え、「導出失敗（unavailable）」を「変更なし（success 空）」から分離し、失敗を既存の fail-closed 経路へ流して不変の残余を閉じる。

## 現状コードの前提

- DU 先例: `listWorktreeChanges(): Promise<WorktreeInspectionResult>`、`WorktreeInspectionResult = {kind:"success"; paths} | {kind:"unavailable"; reason}`（`src/core/port/runtime-strategy.ts:63-65`）。
- `listChangedFiles(baseBranch, cwd, branch): Promise<string[]>`（port `runtime-strategy.ts`、LocalRuntime `local.ts:695`、ManagedRuntime `managed.ts` は `[]`）。
- 呼び出し 4 箇所:
  1. `scope-check.ts:55` — `canDeriveChangedFiles()===false` は先に UNKNOWN 合成（`synthesizeScopeUnverifiableFinding`）。それ以外は listChangedFiles → `deriveScopeBreach`。
  2. `executor.ts:274`（activation gate）— `canDeriveChangedFiles()===false` は listChangedFiles を呼ばず `changedFilesDerivable:false` で fail-closed activate。それ以外は listChangedFiles → `evaluateActivation`。
  3. `parallel-review-round.ts:116`（round invalidation）— listChangedFiles → `excludeChangeFolderPaths` → `computeInvalidations`。managed の `[]` → invalidation 不発は文書化済み fail-safe（Non-Goal）。
  4. `no-op-detect.ts:54` — listChangedFiles → artifact 除外 → source 変更 0 なら `needs-fix` へ escalate（＝失敗時 `[]` は既に escalate 方向で安全側）。
- B-11: 具象 runtime は `RealRuntimeStrategy`（`canDeriveChangedFiles` 必須）を implements。DU 化しても本 tooth は不変（能力メソッドは残す）。

## 要件

1. `RuntimeStrategy.listChangedFiles` の戻り値を DU `ChangedFilesResult = {kind:"success"; files: string[]} | {kind:"unavailable"; reason: string}` に変える（`WorktreeInspectionResult` と同型）。型が consumer に discriminant 判定を強制する（compile-time tooth）。
2. LocalRuntime: `git diff` 成功 → `success`（`files` は空でも「変更なし」の意味）。非ゼロ終了・throw → `unavailable`（**本修正の核**。従来の `[]` fold を廃止）。ManagedRuntime: `unavailable`（従来 `[]`）。
3. scope-check: `unavailable` → 構造的非導出（`canDeriveChangedFiles()===false`）と同じ UNKNOWN decision-needed finding を合成（`synthesizeScopeUnverifiableFinding`）。`success` → 従来どおり `deriveScopeBreach`。
4. reviewer activation gate: `unavailable` → `changedFilesDerivable:false` で fail-closed activate（paths reviewer を活性化、skip しない）。`success` → 従来どおり `evaluateActivation`。
5. round-invalidation・no-op-detect: `unavailable` を「no-signal（空相当）」として扱い**現挙動を保存**する。managed の fail-safe（invalidation 不発）と no-op-detect の escalate 方向は不変。既存テストは無改変で green。
6. `canDeriveChangedFiles()` / B-11 は維持（DU は per-call 失敗を、canDerive は構造的非導出を担う。二重化ではなく相補）。
7. 不変の所在更新: `components.md`（runtime seam / scope-check 不変）と `dynamic-model.md:61` に、fail-closed 不変が **runtime 導出失敗（canDerive===true で call が失敗）**も対象にすることを反映。§4 B-invariant 行 / ADR の要否は design step が評価する。

## スコープ外

- `canDeriveChangedFiles()` / B-11 の削除・変更（維持）。
- round-invalidation site の local-transient under-fire を fail-closed 化すること（現挙動保存。managed/local 分岐を持ち込まない。別 follow-up）。
- managed parallel custom reviewer 対応（Non-Goal 不変）。
- git **書き込み**経路（`commit-push.ts` の add/diff/commit fail-open）— 別 request。

## 受け入れ基準

- [ ] `listChangedFiles` が `ChangedFilesResult` DU を返し、LocalRuntime で `git diff` 非ゼロ終了・throw 時に `unavailable`（success-empty ではない）を返すことをテストで固定。
- [ ] ManagedRuntime が `unavailable` を返すことをテストで固定。
- [ ] 導出能力のある runtime で `listChangedFiles` が `unavailable` の時、scope-check が UNKNOWN decision-needed finding を合成することをテストで固定（fail-closed。従来の fail-open 素通りが閉じる）。
- [ ] 同 `unavailable` の時、activation gate が paths 条件付き reviewer を活性化する（skip しない）ことをテストで固定。
- [ ] round-invalidation・no-op-detect の既存テストが無改変で green（挙動保存）。managed の invalidation 不発が不変。
- [ ] DU 化により全 consumer が discriminant を扱い、`[]`=「変更なし」への暗黙 fold が型として不能であることを確認。
- [ ] `typecheck && test` green。

## architect 評価済みの設計判断

- **採用**: DU 化（`listWorktreeChanges` 同型、field 名 `files`）。「導出失敗」と「変更なし」を型で分離し、`[]`=無変更への暗黙畳み込みを表現不能にする（自己強制 tooth）。
- **採用**: fail-closed の routing は**既存ハンドラ再利用** — scope-check は `synthesizeScopeUnverifiableFinding`、activation は `changedFilesDerivable:false`。新 escalation 機構を作らない。
- **採用**: round-invalidation・no-op-detect は挙動保存の機械的適応（`unavailable` ≡ 空）。fail-closed 化しない。理由: managed の Non-Goal・reviewer が名指ししていない・test churn 回避。
- **却下**: 別メソッド追加（`deriveChangedFiles` を新設し 2 consumer だけ移行）。seam が二重化し smell。単一 seam を DU 化する。
- **却下**: `canDeriveChangedFiles()` を DU 化で置換・削除。構造的非導出の短絡（managed で無駄な git 呼び出しを避ける）と B-11 tooth を失う。相補で残す。
- **design step へ委譲**: DU tooth が §4 B-invariant 行（B-11 拡張 or 新規）/ ADR を要するか。既存不変 `scope-unevaluable-fail-closed` の残余を閉じる位置づけ。
