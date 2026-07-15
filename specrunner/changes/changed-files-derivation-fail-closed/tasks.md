# Tasks: changed-files 導出失敗を fail-closed 化する（`listChangedFiles` を DU 化）

> 実装順の原則: まず T-01 で seam の DU 型と port contract を interface-stable に確定させ、
> T-02〜T-05 で各 runtime 実装と 4 consumer 配線を DU へ追随させる。signature に依存する
> spy / behavior test は seam 確定後の T-06 に置く（interface 確定前に test を書かない）。
> T-07 は architecture prose の所在更新（既存不変の記述正確化のみ、新 §4 行・新 ADR なし）。
> `canDeriveChangedFiles()` / B-11 は維持（削除・変更しない）。
> round-invalidation・no-op-detect の**振る舞い**は不変（`unavailable ≡ 空` の機械的適応のみ）。

## T-01: `listChangedFiles` seam を判別共用体にし port contract を更新する（D1）

- [ ] `src/core/port/runtime-strategy.ts` に DU 型を定義・export する（`WorktreeInspectionResult`（`:63-65`）と同型、**field 名は `files`**）:
  - `export type ChangedFilesResult = { kind: "success"; files: string[] } | { kind: "unavailable"; reason: string }`。
  - 型は port 定義ファイル内に置く（`reason: string` のみで表現し domain 型を import しない ＝ ports→domain 非依存を維持）。
- [ ] `RuntimeStrategy.listChangedFiles(baseBranch, cwd, branch)`（`:410`）の戻り値を `Promise<string[]>` → `Promise<ChangedFilesResult>` に変更する（必須メソッドのまま）。
- [ ] doc comment（`:394-410` 付近）の「Never throws. Returns [] on any error」を除去し、新 contract に更新する:
  - 成功時 `{kind:"success", files}`（repo 相対。`files` は空でも「変更なし」を意味する）。
  - 導出不能時 `{kind:"unavailable", reason}`（reason に exit code / エラー概要）。
  - throw しない点は維持する（DU を返して表現する）。
  - local / managed の分岐説明も新 contract に合わせて更新する。
- [ ] `RealRuntimeStrategy`（`:546-559`）は `listChangedFiles` を再宣言していない（base の必須メソッド）ため変更不要であることを確認する（`canDeriveChangedFiles` の必須化＝B-11 は無傷）。

**Acceptance Criteria**:
- `ChangedFilesResult` が port 定義ファイルに export され、domain import を増やさない。
- port の `listChangedFiles` 戻り値が `Promise<ChangedFilesResult>`。
- doc comment から「returns [] on any error」が消え、成功=success（`files`）/ 導出不能=unavailable（`reason`）の新 contract に更新されている。
- `RealRuntimeStrategy` / B-11 が無変更。

## T-02: LocalRuntime を DU に追随させ、git diff 失敗を導出不能にする（D2）

- [ ] `src/core/runtime/local.ts:695-710` `listChangedFiles`:
  - `git diff --name-only <base>...HEAD` exit 0 → 従来の split / trim / 空行除去で `files` を組み `{kind:"success", files}` を返す。
  - exit 非ゼロ → `{kind:"unavailable", reason}`（reason に exit code。例: `git diff exited with code ${result.exitCode}`）。
  - catch（spawn 例外・その他例外）→ `{kind:"unavailable", reason}`（reason にエラー概要）。
  - パースロジック自体は不変。戻り値の wrap と失敗経路のみ変える。
- [ ] doc comment（`:690-694`）の「Never throws — returns [] on any error」を新 contract に更新する。
- [ ] `canDeriveChangedFiles()`（`:716-718`）は `true` のまま変更しない。

**Acceptance Criteria**:
- exit 0 で `{kind:"success", files}`（変更ファイルを repo 相対で、空行除去済み）。
- 非ゼロ終了で `{kind:"unavailable"}`（reason に exit code）。
- spawn 例外・その他例外で `{kind:"unavailable"}`（reason にエラー概要）。
- どの失敗経路でも空の success（`{kind:"success", files:[]}`）を返さない。
- `canDeriveChangedFiles()` は `true` のまま。

## T-03: ManagedRuntime を DU に追随させ、導出不能を返す（D3）

- [ ] `src/core/runtime/managed.ts:536-542` `listChangedFiles`: `{kind:"unavailable", reason}` を返す（従来 `[]`）。reason に理由を含める（例: `managed runtime cannot derive changed files (no local worktree)`）。
- [ ] doc comment（`:522-535`）を新 contract に更新する（「local worktree 不在ゆえ changed-files を構造的に導出できない＝導出不能」旨。従来の「`[]` は no-changes ではない」記述を DU 表現に置き換える）。
- [ ] `canDeriveChangedFiles()`（`:552-554`）は `false` のまま変更しない。

**Acceptance Criteria**:
- managed は常に `{kind:"unavailable", reason}` を返す。
- 空の success を返さない。
- `canDeriveChangedFiles()` は `false` のまま。

## T-04: fail-closed consumer を DU 分岐に配線する（既存ハンドラ再利用）（D4）

- [ ] `src/core/step/scope-check.ts:49-62`:
  - `canDeriveChangedFiles()===false` の短絡（`:49-51`、`synthesizeScopeUnverifiableFinding`）は**不変**。
  - `:55` の `listChangedFiles` を DU 分岐にする: `result.kind !== "success"`（＝ `unavailable`）→ `return synthesizeScopeUnverifiableFinding({ slug: deps.slug })`（fail-closed）。`result.kind === "success"` → `deriveScopeBreach({ scope, changedFiles: result.files, state })`（従来経路）。
  - `synthesizeScopeUnverifiableFinding` / `deriveScopeBreach` のロジックは変更しない（再利用のみ）。
- [ ] `src/core/step/executor.ts:268-284` activation gate:
  - `canDeriveChangedFiles()===false` は従来どおり `listChangedFiles` を呼ばず `changedFilesDerivable: false`。
  - それ以外（derivable）で `listChangedFiles` を呼び、`result.kind === "success"` → `changedFiles = result.files`、`result.kind === "unavailable"` → `changedFilesDerivable = false`（＋ `changedFiles = []`）で `evaluateActivation` に渡す。
  - `evaluateActivation`（`activation.ts:83-85` の `changedFilesDerivable === false` 分岐）のロジックは変更しない（再利用のみ）。

**Acceptance Criteria**:
- scope-check: 導出能力のある runtime で `unavailable` → `synthesizeScopeUnverifiableFinding`（UNKNOWN）を返す。`success` → 従来どおり `deriveScopeBreach`。`canDerive===false` の短絡は不変。
- activation gate: 導出能力のある runtime で `unavailable` → `changedFilesDerivable: false` で `evaluateActivation`（paths reviewer 活性化）。`success` → 従来どおり変更ファイルで評価。`canDerive===false` の短絡は不変。
- 新 escalation 機構を作らず既存ハンドラを再利用する。`evaluateActivation` / `synthesizeScopeUnverifiableFinding` / `deriveScopeBreach` に手を入れない。

## T-05: 挙動保存 consumer を DU 分岐に配線する（unavailable ≡ 空）（D5）

- [ ] `src/core/pipeline/parallel-review-round.ts:116`:
  - `const result = await listChangedFiles(s.approvedAtCommit, cwd, branch)` → `const touched = result.kind === "success" ? result.files : []`。以降 `excludeChangeFolderPaths(touched)` → `computeInvalidations` は不変。
  - コメント（`:104` の managed fail-safe 説明）を DU 表現に更新する（`unavailable` → 空写像で invalidation 不発が保存される旨）。
- [ ] `src/core/step/no-op-detect.ts:54`:
  - `const result = await runtimeStrategy.listChangedFiles(headBeforeStep, cwd, branch)` → `const changedFiles = result.kind === "success" ? result.files : []`。以降 artifact 除外・source 変更 0 判定は不変。
- [ ] `computeInvalidations` / `excludeChangeFolderPaths` / no-op の escalate ロジックには手を入れない（呼び出し前の写像のみ）。

**Acceptance Criteria**:
- round-invalidation: `unavailable` → touched を空扱い → invalidation 不発（managed fail-safe 保存）。`success` → 従来どおり `result.files` で判定。
- no-op-detect: `unavailable` → source 変更 0 扱い → `needs-fix` escalate 方向保存。`success` → 従来どおり `result.files` で判定。
- 両 consumer の**振る舞い**が main と同一（fail-closed 化しない）。

## T-06: 全 test fake を DU へ移行し、fail-closed の新挙動を固定する（D6）

> 原則: `grep -rn "listChangedFiles" src tests` で全 stub を列挙し、`string[]` を返す stub を
> `{kind:"success", files:[...]}` へ機械移行する。移行漏れは typecheck（typed fake）または
> 更新した behavior test（`as never` fake）が検出する。behavioral assertion（`expect`）は
> 極力不変に保ち、fake の返り値 shape のみ移行する（挙動保存 consumer は特にそう）。

### 直接 impl テスト（seam の DU 契約を固定）

- [ ] `tests/unit/runtime/list-changed-files.test.ts`:
  - LocalRuntime: exit 0 の解析テストを `{kind:"success", files}` 形へ移す。
  - LocalRuntime: 「非ゼロ終了 → `[]`」「spawn throw → `[]`」を **「→ `{kind:"unavailable"}`（reason 検証）」** に置き換える（**success-empty ではないことを固定**）。
  - ManagedRuntime: 「always returns `[]`」を **「→ `{kind:"unavailable"}`（reason 検証）」** に置き換える。
  - `canDeriveChangedFiles` の既存テスト（local=true / managed=false）は不変。

### fail-closed 新挙動テスト（本 request の主眼）

- [ ] `tests/unit/core/step/scope-escalation.test.ts`:
  - `makeRuntimeStrategy(changedFiles)`（`:175`、typed `RuntimeStrategy`）の `listChangedFiles` を `{kind:"success", files: changedFiles}` へ移行する（success 経路の既存 breach/no-breach テストを維持）。`makeEvaluableRuntimeStrategy`（`:1133`）も同様。
  - **新 test**: `canDeriveChangedFiles() === true` かつ `listChangedFiles` が `{kind:"unavailable", reason}` を返す fake を追加し、checkpoint step で verdict=escalation、toolResult に UNKNOWN finding（origin:"scope"、resolution:"decision-needed"、severity:"high"、options ≥2）が合成されることを固定する（従来の fail-open 素通りが閉じることの証明）。既存 `makeUnevaluableRuntimeStrategy`（`:868`、canDerive===false）とは別軸のテスト。
  - `makeUnevaluableRuntimeStrategy`（canDerive===false）の既存テストは、`listChangedFiles` を呼ばない短絡が不変であることを維持する（`listChangedFiles` は spy のままだが返り値 shape は使われない — 呼ばれないことを検証しているため）。
- [ ] `tests/unit/step/executor-activation.test.ts`:
  - `makeRuntimeStrategy(listChangedFiles, canDeriveImpl?)`（`:115-140`）の型 `listChangedFiles: (...) => Promise<ChangedFilesResult>` へ更新。success を返す stub（`["src/auth/login.ts"]` 等）を `{kind:"success", files:[...]}` へ移行する。
  - **新 test**: `canDeriveChangedFiles() === true` かつ `listChangedFiles` が `{kind:"unavailable"}` を返すとき、`paths` 条件付き reviewer が活性化される（agent が呼ばれ `skipped` にならない）こと、かつ `listChangedFiles` が呼ばれたことを固定する（既存の canDerive===false 短絡テスト `:299-328` とは別軸）。
- [ ] `tests/unit/core/step/fast-scope-checkpoint.test.ts`:
  - `makeEvaluableStrategyWithSpy(changedFiles)`（`:154-157`）の `listChangedFiles` を `{kind:"success", files: changedFiles}` へ移行する。checkpoint/非 checkpoint の呼び出し有無テストは不変。

### 挙動保存 consumer テスト（返り値 shape のみ機械移行、assertion 不変）

- [ ] `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`:
  - 全 `listChangedFiles: vi.fn(async () => [...])`（`:197,252,278,309,345,370,404,430`）を `{kind:"success", files:[...]}` へ移行する。behavioral assertion（Req 2a/2b/3/4 の `wasCalled` / `outcome` / `status`）は不変。
- [ ] `src/core/step/__tests__/executor-no-op.test.ts`:
  - `makeRuntimeStrategy(changedFiles)`（`:87`）の `listChangedFiles` を `{kind:"success", files: changedFiles}` へ移行する。T-03 no-op / Req 1-4 の verdict assertion は不変。
- [ ] `tests/unit/step/executor-no-op.test.ts`:
  - `makeStrategy`（`:110`、typed `RuntimeStrategy`）の `listChangedFiles` を `{kind:"success", files: opts.changedSourceFiles}` へ移行する。TC-NOP-001/002/003/004 の verdict assertion は不変。

### その他 stub の一括移行（success:[] へ機械移行、assertion 不変）

- [ ] 以下の fake の `listChangedFiles`（多くは `[]` を返す）を `{kind:"success", files:[]}` へ移行する（behavioral assertion 不変）:
  - `src/core/step/__tests__/executor-round-produce.test.ts:187`
  - `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:145,427`
  - `src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts:174`
  - `src/core/pipeline/__tests__/parallel-review-round-resume.test.ts:114`
  - `tests/custom-reviewers-e2e.test.ts:1074`（`["src/feature.ts"]` → `{kind:"success", files:["src/feature.ts"]}`）
  - `tests/unit/step/executor-skip-when.test.ts:112`
  - `tests/unit/core/command/pipeline-run.test.ts:93`, `runner.test.ts:129`, `resume.test.ts:144,286`, `pipeline-run-reviewer-snapshot.test.ts:133`, `pipeline-run-gate.test.ts:129`, `pipeline-run-input-completeness.test.ts:172`, `pipeline-run-duplicate-guard.test.ts:108`
- [ ] `grep -rn "listChangedFiles" tests` で上記に含まれない stub（例: `tests/reviewer-activation-e2e.test.ts` / `tests/pipeline-integration.test.ts` が real LocalRuntime 経由でないか、fake 経由か）を確認し、fake があれば同様に移行する。real LocalRuntime を使う e2e は seam 実装（T-02）追随で自動的に整合する。

**Acceptance Criteria**:
- LocalRuntime: 非ゼロ終了・throw で `{kind:"unavailable"}`（success-empty ではない）、exit 0 で `{kind:"success", files}` が test で固定される。
- ManagedRuntime: `{kind:"unavailable"}` が test で固定される。
- 導出能力のある runtime（canDerive===true）で `unavailable` のとき、scope-check が UNKNOWN decision-needed finding を合成し verdict=escalation になることが test で固定される。
- 同 `unavailable` のとき、activation gate が paths 条件付き reviewer を活性化する（skip しない）ことが test で固定される。
- round-invalidation・no-op-detect の behavioral assertion が不変で green（返り値 shape のみ機械移行、挙動保存）。managed の invalidation 不発が不変。
- `grep -rn "listChangedFiles" src tests` で `string[]` を返す stub が残っていない。

## T-07: 不変の所在（architecture prose）を更新する（D7 / D8）

> prose のみ。新 §4 B-invariant 行・新 tooth・新 ADR は作らない（design D8 の評価に従う）。
> 既存不変 `scope-unevaluable-fail-closed` の documented scope を「per-call 導出失敗」まで正確化する。

- [ ] `architecture/components.md:27`（Scope derivation 不変条件）: 「`canDeriveChangedFiles?.() === false` の runtime では … UNKNOWN を合成」に、「導出能力のある runtime で `listChangedFiles` が `unavailable` を返した場合も同様に UNKNOWN を合成する（構造的非導出と per-call 失敗を相補で塞ぐ）」を追記する。
- [ ] `architecture/components.md:148`（変更ファイル観測 `listChangedFiles`）: 戻り値が `ChangedFilesResult` DU であること、LocalRuntime=`git diff` 成功→success / 失敗→unavailable、ManagedRuntime=unavailable を反映する（`[]` 記述を除去）。
- [ ] `architecture/components.md:149`（能力 predicate）: `canDeriveChangedFiles` が**構造的非導出**、DU の `unavailable` が**per-call 導出失敗**を担う相補である旨を明記する（`canDeriveChangedFiles()` 維持を反映）。
- [ ] `architecture/dynamic-model.md:61`（capability gate 不変条件）: 「back（scope checkpoint escalation）」が front（capability gate＝構造的非導出）だけでなく **per-call 導出失敗（`listChangedFiles` の `unavailable`）** も UNKNOWN 合成で捕捉する、と追記する。
- [ ] `architecture/model.md` §4 は**変更しない**（DU tooth は型が担い §4 の対象外、B-11 無傷 — design D8）。`specrunner/adr/` は**変更しない**（adr:false、既存不変の refine — design D8）。

**Acceptance Criteria**:
- `components.md` の scope-check 不変・runtime seam・能力 predicate の記述が、per-call 導出失敗（unavailable）を fail-closed 対象に含むよう更新されている。
- `dynamic-model.md:61` が per-call 導出失敗も back で捕捉することを反映している。
- `architecture/model.md` §4 と `specrunner/adr/` に変更が無い。
- 更新は prose の正確化のみで、新規不変・新規 tooth を導入していない。

## T-08: 全体検証

- [ ] `bun run typecheck` が green（全 consumer が DU discriminant を扱い、`string[]` 前提の残存が型エラーとして出ないこと＝`[]`=「変更なし」への暗黙 fold が型として不能であることの確認）。
- [ ] `bun run test` が green（更新 test 含む、scope / activation / round-invalidation / no-op / runtime git test の regression なし）。
- [ ] 変更 src ファイルが `src/core/port/runtime-strategy.ts` / `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` / `src/core/step/scope-check.ts` / `src/core/step/executor.ts` / `src/core/pipeline/parallel-review-round.ts` / `src/core/step/no-op-detect.ts` と対応 test、および `architecture/components.md` / `architecture/dynamic-model.md` に限られることを確認する。
- [ ] `canDeriveChangedFiles()` / B-11 / `RealRuntimeStrategy` が無変更であることを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ基準）。
- DU 化により全 consumer が discriminant を扱い、`[]`=「変更なし」への暗黙 fold が型として不能であることが typecheck で確認される。
- `canDeriveChangedFiles()` / B-11 が維持されている。
- 変更ファイルが上記スコープに収まる。
