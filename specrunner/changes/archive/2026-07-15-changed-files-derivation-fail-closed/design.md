# Design: changed-files 導出失敗を fail-closed 化する（`listChangedFiles` を DU 化）

## Context

`scope-unevaluable-fail-closed` 不変（ADR `specrunner/adr/2026-06-14-scope-unevaluable-fail-closed.md`、`architecture/model.md:89` の B-11 rationale、`architecture/dynamic-model.md:61`、`architecture/components.md:27`）は「scope を検証できない runtime では fail-open を選ばず着手前に止める / UNKNOWN を合成する」ことを求める。この不変は **構造的に導出できない runtime**（`canDeriveChangedFiles() === false` ＝ managed）については capability gate（着手前 preflight）＋ scope-check / activation gate の UNKNOWN 合成で封じられている。

しかし `RuntimeStrategy.listChangedFiles` は `git diff` の **実行時失敗（非ゼロ終了・throw）を `[]` に畳む**（`src/core/runtime/local.ts:695-710`、docstring「Never throws — returns [] on any error」）。`canDeriveChangedFiles()` は静的な能力宣言で LocalRuntime では常に `true` であり **per-call の失敗を表さない**。その結果、導出能力のある runtime（local）で `git diff` が実行時に失敗すると `[]`＝「変更なし」と区別できず、fail-closed 経路が空振りする。

### 現状の構造と欠陥

- **seam contract**（`src/core/port/runtime-strategy.ts:394-410`）: doc comment に「Never throws. Returns [] on any error」。戻り値 `Promise<string[]>`。`listChangedFiles` は base interface の **必須メソッド**（optional でない）。
- **local 実装**（`src/core/runtime/local.ts:695-710`）: `git diff --name-only <base>...HEAD` を cwd で実行。exit 非ゼロ → `[]`、catch（spawn 例外・その他）→ `[]`。**成功して変更ゼロ** と **導出そのものが失敗** を同じ `[]` に潰している。
- **managed 実装**（`src/core/runtime/managed.ts:536-542`）: local worktree を持たない構造的制約で常に `[]`。`canDeriveChangedFiles()===false`（`managed.ts:552-554`）。
- **consumer 4 箇所**:
  1. **scope-check**（`src/core/step/scope-check.ts:55`）: `canDeriveChangedFiles()===false` は先に UNKNOWN 合成（`scope-check.ts:49-51`、`synthesizeScopeUnverifiableFinding`）。それ以外は `listChangedFiles` → `deriveScopeBreach`。**導出失敗 → `[]` → breach なし判定 → forbidden surface 見逃し（fail-open）**。
  2. **reviewer activation gate**（`src/core/step/executor.ts:268-284`、呼び出し `:274`）: `canDeriveChangedFiles()!==false` のとき `listChangedFiles` → `evaluateActivation`。**導出失敗 → `[]` → paths 条件付き reviewer を skip（fail-open）**。
  3. **round-invalidation**（`src/core/pipeline/parallel-review-round.ts:116`）: `listChangedFiles` → `excludeChangeFolderPaths` → `computeInvalidations`。managed の `[]` → invalidation 不発は**文書化済み fail-safe（Non-Goal、`parallel-review-round.ts:104`）**。
  4. **no-op-detect**（`src/core/step/no-op-detect.ts:54`）: `listChangedFiles` → artifact 除外 → source 変更 0 なら `needs-fix` へ escalate。**失敗時 `[]` は既に escalate 方向で安全側**。

`[]` が現状 3 状態（真の空 / 導出失敗 / 構造的非導出）を潰しており、fail-closed 経路（1・2）で導出失敗を「変更なし」と誤認する。これは既存 DU 先例 `listWorktreeChanges`（`WorktreeInspectionResult`、`runtime-strategy.ts:63-65`、archive `2026-07-14-round-inspection-fail-closed`）が閉じた欠陥と同型であり、本 request は同じパターンで `listChangedFiles` を閉じる。

## Goals / Non-Goals

**Goals**:

- `listChangedFiles` の戻り値を判別共用体（DU）`ChangedFilesResult` にし、「導出成功（files）」と「導出失敗（unavailable）」を型で分離する。`[]`=「変更なし」への暗黙 fold を**表現不能**にする（compile-time tooth）（G1）。
- LocalRuntime: `git diff` 成功 → `success`（`files` は空でも「変更なし」）、非ゼロ終了・throw → `unavailable`（**本修正の核**。`[]` fold を廃止）。ManagedRuntime → `unavailable`（G2）。
- fail-closed consumer（scope-check・activation gate）は `unavailable` を **既存の fail-closed ハンドラに再利用ルーティング**する。新 escalation 機構を作らない（G3）。
- 挙動保存 consumer（round-invalidation・no-op-detect）は `unavailable` を「no-signal（空相当）」に写像し**現挙動を保存**する（G4）。
- `canDeriveChangedFiles()` / B-11 を維持する。DU は per-call 失敗、canDerive は構造的非導出を担う相補（G5）。
- 不変の所在（`components.md` / `dynamic-model.md:61`）を、fail-closed 不変が **per-call 導出失敗**も対象にすることに更新する（G6）。

**Non-Goals**:

- `canDeriveChangedFiles()` / B-11 の削除・変更（維持）。
- round-invalidation site の local-transient under-fire を fail-closed 化すること（現挙動保存。managed/local 分岐を持ち込まない。別 follow-up）。
- managed parallel custom reviewer 対応（Non-Goal 不変）。
- git **書き込み**経路（`commit-push.ts` の add/diff/commit fail-open）— 別 request。
- 新しい port / pattern の導入（既存 `listWorktreeChanges` DU パターンの再適用に限る）。

## Decisions

### D1 — `listChangedFiles` の戻り値を判別共用体 `ChangedFilesResult` にする（G1）

`src/core/port/runtime-strategy.ts` に DU を定義・export する（`WorktreeInspectionResult` と同型、**field 名は `files`**）:

```
ChangedFilesResult =
  | { kind: "success"; files: string[] }
  | { kind: "unavailable"; reason: string }
```

`RuntimeStrategy.listChangedFiles(baseBranch, cwd, branch)` の戻り値を `Promise<string[]>` → `Promise<ChangedFilesResult>` に変更する（必須メソッドのまま）。doc comment（`:394-410`）の「Never throws. Returns [] on any error」を新 contract に書き換える:

- 成功時 `{kind:"success", files}`（repo 相対、`files` は空でも「変更なし」を意味する）。
- 導出不能時 `{kind:"unavailable", reason}`（reason に exit code / エラー概要）。
- throw しない点は維持（DU を返して表現する）。

**Rationale**: `[]` が 3 状態を潰しているのが欠陥の根。DU にすれば型レベルで区別が強制され、consumer は `kind` で網羅分岐せざるを得ず、`[]`=無変更への暗黙畳み込みが**表現不能**になる（自己強制 tooth）。error 情報を `reason: string` に限定することで port→domain 非依存を維持する（`WorktreeInspectionResult` と同じ方針、既存の `unknown` 引数と整合）。`RealRuntimeStrategy`（`runtime-strategy.ts:546-559`）は `listChangedFiles` を再宣言していない（base の必須メソッド）ため intersection への変更は不要。B-11 の tooth（能力メソッド必須化）は無傷。

**Alternatives considered**:

- *別メソッド追加（`deriveChangedFiles` を新設し fail-closed の 2 consumer だけ移行）*: seam が二重化し smell。単一 seam を DU 化する（architect 却下）。
- *`null` を導出不能に使う（`Promise<string[] | null>`）*: reason（診断文字列）を運べず、escalation / UNKNOWN finding の rationale に写像する情報が失われる。却下。
- *field 名を `paths` にする*: `WorktreeInspectionResult` は worktree 相対 path だが本 seam は git diff の changed **files**。request 指定どおり `files` にし意味を明確化する。

### D2 — LocalRuntime: git diff 失敗を `unavailable`、exit 0 を `success` にする（G2）

`LocalRuntime.listChangedFiles`（`local.ts:695-710`）:

- `git diff --name-only <base>...HEAD` exit 0 → 従来の split / trim / 空行除去で `files` を組み `{kind:"success", files}`。
- exit 非ゼロ → `{kind:"unavailable", reason}`（reason に exit code。例: `git diff exited with code ${result.exitCode}`）。
- catch（spawn 例外・その他）→ `{kind:"unavailable", reason}`（reason にエラー概要）。

パースロジック自体は不変。戻り値の wrap と失敗経路のみ変える。`canDeriveChangedFiles()`（`local.ts:716-718`）は `true` のまま。

**Rationale**: 導出できていない diff を「変更なし」に落とさないのが主眼。非ゼロ終了・spawn 失敗は「diff の実状態が不明」であり、この未知状態を consumer に伝えて fail-closed へ導く。`listWorktreeChanges`（`local.ts:735-763`）の D2 と同型。

**Alternatives considered**:

- *非ゼロ終了だけ unavailable、spawn 例外は従来どおり `[]` 相当*: spawn 例外（git 不在等）こそ導出不能の典型で、ここを clean 扱いすると fail-open が残る。全失敗経路を unavailable に倒す。却下。

### D3 — ManagedRuntime: `unavailable` を返す（G2）

`ManagedRuntime.listChangedFiles`（`managed.ts:536-542`）は `{kind:"unavailable", reason}` を返す（従来 `[]`）。reason は「local worktree を持たず changed-files を導出できない」旨（例: `managed runtime cannot derive changed files (no local worktree)`）。`canDeriveChangedFiles()`（`managed.ts:552-554`）は `false` のまま。doc comment を新 contract に更新する。

**Rationale**: managed は **構造的に導出できない**（canDerive===false）ため、per-call 結果も導出不能が真値。`listWorktreeChanges` の managed=`success:[]`（worktree 不在＝真の空、member も worktree に書かない）とは線引きが異なる:

- `listWorktreeChanges`: managed member は local worktree に書かないので「変更なし」は**真の空**（success:[]）。
- `listChangedFiles`: managed は base...HEAD の diff を **そもそも導出できない**（local git なし）ので**導出不能**（unavailable）。canDerive===false と整合。

この asymmetry は意図的で、canDerive predicate と DU が相補であることの表れ。

**挙動保存の確認**: scope-check・activation gate は managed（canDerive===false）で `listChangedFiles` を**呼ぶ前に**短絡する（D4）ため、managed の `unavailable` は両者に届かない。round-invalidation のみが managed で `listChangedFiles` を呼ぶが、`unavailable` は `[]` に写像され（D5）、invalidation 不発（fail-safe）が保存される。no-op-detect は managed で `captureHeadSha` が null → そもそも呼ばれない。よって managed=`unavailable` 化はどの consumer の観測挙動も変えない。

**Alternatives considered**:

- *managed も `success:[]`（listWorktreeChanges と同じ）*: managed は canDerive===false で構造的に diff を導出できず、`success:[]`（「変更なしを確認できた」）は偽の主張。`unavailable` が真値で canDerive predicate と整合する。却下。

### D4 — fail-closed consumer は `unavailable` を既存ハンドラに再利用ルーティングする（G3）

新 escalation 機構を作らず、`canDeriveChangedFiles()===false` と**同じ**ハンドラへ流す。

**scope-check**（`scope-check.ts:49-62`）: `canDeriveChangedFiles()===false` の短絡（`:49-51`、`synthesizeScopeUnverifiableFinding`）は不変。その後の `listChangedFiles` を DU 分岐にする:

```
const result = await listChangedFiles(baseBranch, cwd, branch);
if (result.kind !== "success") {
  return synthesizeScopeUnverifiableFinding({ slug: deps.slug });  // unavailable → UNKNOWN（fail-closed）
}
const breach = deriveScopeBreach({ scope, changedFiles: result.files, state });
...
```

**activation gate**（`executor.ts:268-284`）: `canDeriveChangedFiles()===false` は従来どおり `listChangedFiles` を呼ばず `changedFilesDerivable:false`。それ以外で `listChangedFiles` を呼び、`unavailable` なら `changedFilesDerivable:false`（＋ `changedFiles:[]`）で `evaluateActivation`（`activation.ts:83-85` が paths reviewer を活性化）:

```
const canDerive = runtimeStrategy?.canDeriveChangedFiles?.() !== false;
let changedFiles: string[] = [];
let changedFilesDerivable = canDerive;
if (runtimeStrategy && canDerive) {
  const result = await runtimeStrategy.listChangedFiles(baseBranch, cwd, branch);
  if (result.kind === "success") changedFiles = result.files;
  else changedFilesDerivable = false;  // unavailable → fail-closed（既存 changedFilesDerivable:false 経路）
}
evaluateActivation(step.activation, { changedFiles, requestType, changedFilesDerivable });
```

**Rationale**: fail-closed の routing は既存の 2 ハンドラ（`synthesizeScopeUnverifiableFinding` / `changedFilesDerivable:false`）で完結する。per-call 失敗（unavailable）と構造的非導出（canDerive===false）は「scope を検証できない / paths を評価できない」という**同一の意味論**に収束するため、同じ UNKNOWN 合成・同じ活性化に流すのが最小かつ意味的に正しい。`evaluateActivation` / `synthesizeScopeUnverifiableFinding` のロジックには手を入れない。

**Alternatives considered**:

- *unavailable 専用の新 finding / 新 verdict を作る*: 意味論が既存 UNKNOWN と同一（scope を検証できない）で二重化。既存ハンドラ再利用が最小（architect 採用）。

### D5 — 挙動保存 consumer は `unavailable` を「no-signal（空相当）」に写像する（G4）

**round-invalidation**（`parallel-review-round.ts:116`）: `unavailable` → `[]` に写像し `excludeChangeFolderPaths([])` → `computeInvalidations` を従来どおり通す:

```
const result = await listChangedFiles(s.approvedAtCommit, cwd, branch);
const touched = result.kind === "success" ? result.files : [];  // unavailable → [] → invalidation 不発
const sourceTouched = excludeChangeFolderPaths(touched);
```

**no-op-detect**（`no-op-detect.ts:54`）: 同様に `unavailable` → `[]`。source 変更 0 → escalate 方向が保存される:

```
const result = await runtimeStrategy.listChangedFiles(headBeforeStep, cwd, branch);
const changedFiles = result.kind === "success" ? result.files : [];  // unavailable → [] → needs-fix へ escalate（安全側）
```

**Rationale**: fail-closed 化しない理由は architect 評価済み — managed の invalidation 不発は文書化済み Non-Goal（`parallel-review-round.ts:104`）、no-op-detect の失敗時 `[]`→escalate は既に安全側、reviewer が名指ししていない、test churn 回避。`unavailable ≡ 空` の機械的適応で観測挙動が main と同一に保たれる。round-invalidation site の local-transient under-fire を fail-closed 化することは明示的に Non-Goal（別 follow-up）。

**Alternatives considered**:

- *round-invalidation・no-op-detect も fail-closed 化する*: managed の Non-Goal に反し（invalidation を毎回発火させる）、no-op-detect は既に escalate 方向で安全、reviewer が名指ししていない。過剰。現挙動保存が正しい（architect 採用）。

### D6 — 全 test fake を DU へ移行し、fail-closed の新挙動を固定する（G1/G3）

seam の DU 化は `listChangedFiles` を stub する**全 fake の返り値 shape 移行**を機械的に要求する（`listWorktreeChanges` の DU 化時と同じ）。`grep -rn "listChangedFiles" src tests` で全 stub を列挙し、`string[]` を返す stub を `{kind:"success", files:[...]}` へ移行する。加えて、per-call `unavailable` の fail-closed 新挙動をテストで固定する:

- **導出能力のある runtime（canDerive===true）で `listChangedFiles` が `unavailable`** → scope-check が UNKNOWN decision-needed finding を合成する（従来の fail-open 素通りが閉じる）。
- 同 `unavailable` → activation gate が paths 条件付き reviewer を活性化する（skip しない）。
- LocalRuntime: 非ゼロ終了・throw → `unavailable`（success-empty ではない）。ManagedRuntime → `unavailable`。

**round-invalidation・no-op-detect の挙動保存に関する注記（受け入れ基準の解釈）**: これらの consumer は `unavailable → []` の写像で**観測挙動が完全に保存**される（invalidation 不発・no-op escalate 方向とも main と同一）。ただし D1 の DU 型変更は seam を stub する fake の**返り値 shape を機械移行**することを不可避に要求する（raw `string[]` を返す fake は consumer の `.kind` 分岐で `undefined` になり空扱いされ、Req3=source-touched 再実行 / TC-NOP-002=source 変更→非 override が壊れる）。したがって受け入れ基準「既存テストが無改変で green」は、**behavioral assertion（`expect(...)`）が不変**・**fake の返り値 shape のみ機械移行**、と解釈する（`listWorktreeChanges` DU 化時と同じ扱い）。これは型変更の不可避な帰結であり、挙動そのものは保存される。この解釈は Risks に明記する。

### D7 — 不変の所在（architecture prose）を更新する（G6）

fail-closed 不変が **per-call 導出失敗（canDerive===true で call が失敗）** も対象にすることを prose に反映する（新規不変の追加ではなく、既存不変の documented scope を正確化する refine）:

- `architecture/components.md:27`（Scope derivation 不変条件）: 「`canDeriveChangedFiles?.() === false` の runtime では … UNKNOWN を合成」に加え、「**導出能力のある runtime で `listChangedFiles` が `unavailable` を返した場合も同様に UNKNOWN を合成する（構造的非導出と per-call 失敗を相補で塞ぐ）**」を追記。
- `architecture/components.md:148`（変更ファイル観測 `listChangedFiles`）: 戻り値が `ChangedFilesResult` DU であること、LocalRuntime=success/unavailable、ManagedRuntime=unavailable を反映（`[]` 記述を除去）。
- `architecture/components.md:149`（能力 predicate）: canDerive が構造的非導出、DU が per-call 失敗を担う相補であることを明記。
- `architecture/dynamic-model.md:61`（capability gate 不変条件）: 「back（scope checkpoint escalation）」が front（capability gate＝構造的非導出）だけでなく **per-call 導出失敗（`listChangedFiles` の `unavailable`）** も UNKNOWN 合成で捕捉する、と追記。

これらは**既存不変の記述の正確化**であり、prose のみ。src の tooth（型）と docs の記述を一致させ、将来の読者が fail-open を再導入しないようにする。

### D8 — §4 B-invariant 行 / ADR の要否（design step 評価、request 委譲）

**§4 B-invariant 行: 追加しない。** 理由: `architecture/model.md:74` は「§4 は構造（層・依存・配置）の不変条件のみ。振る舞い・step-outcome 契約の不変条件は扱わない（その強制は `tests/unit/contract/` と型が担う）」と明記する。本 request の tooth は DU 型（discriminant の網羅分岐強制）＝**型が担う**もので、§4 が明示的に型へ委譲する領域。B-11（`RealRuntimeStrategy` 交差型で能力メソッドを必須化）は無傷 — `canDeriveChangedFiles` は必須のまま、`listChangedFiles` は base の必須メソッドのままで、implements 関係は変わらない。よって §4 への新規行・既存行改訂は不要。

**ADR: 新規作成しない。** 理由: request Meta は `adr: false`。本 request は既存不変 `scope-unevaluable-fail-closed`（ADR `2026-06-14-scope-unevaluable-fail-closed.md` 済み）の**残余（runtime per-call 導出失敗経路）を既存 DU パターンで閉じる refine** であり、新しいアーキテクチャ決定を導入しない。既存 ADR の改訂も本 request では行わない（prose 所在更新は components.md / dynamic-model.md で足りる）。

> この評価（§4 行なし・新規 ADR なし・prose 所在更新のみ）が妥当かは spec-review で検証する（Open Questions 参照）。escalation 可。

## Risks / Trade-offs

- **[Risk] test fake の追随漏れで silent fail-open** → `string[]` のまま返す fake が残ると consumer の `result.kind` が `undefined` になり、fail-closed consumer では `kind !== "success"` で UNKNOWN 側に倒れ（安全側だが意図せぬ escalation）、挙動保存 consumer では `[]` に倒れる（Req3 / TC-NOP-002 が壊れる）。→ **Mitigation**: `grep -rn "listChangedFiles" src tests` で全 stub を列挙し漏れなく DU へ移行する（D6、T-06 で全ファイル台帳化）。typecheck が typed fake の漏れを、更新した behavior test が `as never` fake の漏れを検出する。
- **[Risk / 受け入れ基準の解釈] round-invalidation・no-op-detect の「無改変」** → seam の DU 化は fake の返り値 shape 移行を不可避に要求するため literal な byte-unchanged は達成できない。→ **Mitigation**: behavioral assertion 不変・fake shape のみ機械移行、と解釈（D6）。挙動は完全保存。`listWorktreeChanges` DU 化時と同じ扱い。この解釈で問題があれば spec-review で escalation。
- **[Risk] managed の線引き（listChangedFiles=unavailable vs listWorktreeChanges=success:[]）** → 二つの seam で managed の DU 値が異なる。→ **Mitigation**: 意図的（D3）。listChangedFiles は canDerive===false と整合する導出不能、listWorktreeChanges は member が書かない worktree の真の空。両 seam の役割差から導かれる。spec-review で線引きの妥当性を検証する。
- **[Risk] architecture prose 編集（out-of-loop）** → 先例 `round-inspection-fail-closed` は architecture 反映を merge 後 attended に回した。本 request は requirement 7 で prose 更新を明示的に in-scope とする。→ **Mitigation**: 新規不変・新 tooth・ADR を作らず**既存不変の記述正確化（prose のみ）**に限定（D7/D8）。conformance（step 11）は docs が code と一致するため通る想定。
- **[Trade-off] 単一 seam DU の blast radius** → `listChangedFiles` を stub する全 test（src `__tests__` / `tests/` 多数）が shape 移行の対象。→ 別メソッド追加なら blast radius は 2 consumer に限れたが seam 二重化 smell を招く（architect 却下）。単一 seam DU の代償として受容し、機械的移行で対処する。

## Open Questions

- **§4 行なし・新規 ADR なし・prose 所在更新のみ**（D8）の判断が妥当か。architect は「既存不変の残余を既存パターンで閉じる refine」と評価済みだが、DU tooth が §4 昇格 / ADR を要するかは spec-review で最終確認する（request 委譲・escalation 可）。
- **managed = `unavailable` の線引き**（D3）: listChangedFiles の managed=`unavailable`（canDerive===false と整合）と listWorktreeChanges の managed=`success:[]` を分ける判断が妥当か。spec-review で検証する。それ以外は architect 評価済みの設計判断で確定。
