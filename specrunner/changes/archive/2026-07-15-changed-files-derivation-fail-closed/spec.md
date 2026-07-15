# Spec: changed-files 導出失敗を fail-closed 化する（`listChangedFiles` を DU 化）

この spec は既存不変 `scope-unevaluable-fail-closed`（ADR `specrunner/adr/2026-06-14-scope-unevaluable-fail-closed.md`、`architecture/model.md:89` の B-11、`architecture/dynamic-model.md:61`、`architecture/components.md:27`）の**残余（runtime per-call 導出失敗経路）** を閉じる振る舞い正典である。既存 ADR は「scope を検証できない runtime では fail-open を選ばない」構造を定め、本 spec は `RuntimeStrategy.listChangedFiles` seam の戻り値契約（導出成功 / 導出不能の分離）と、導出不能時の consumer 別振る舞い（fail-closed 経路 / 挙動保存経路）を担う。§4 B-invariant 行の新設・新規 ADR は行わず、不変の所在 prose（`components.md` / `dynamic-model.md`）のみ更新する（design D8）。

正典用語:

- **変更ファイル観測 seam**: `RuntimeStrategy.listChangedFiles(baseBranch, cwd, branch)`。base branch と HEAD（または指定 branch）の間で変更されたファイルを列挙する点。
- **導出成功（success）**: changed-files を機械的に確定できた場合。変更ファイル集合（空を含む）を伴う。空は「変更なし」を意味する。
- **導出不能（unavailable）**: changed-files を機械的に確定できなかった場合（git 失敗・構造的非導出）。診断文字列（reason）を伴う。
- **構造的非導出**: runtime が構造的に changed-files を導出できない性質（`canDeriveChangedFiles() === false`、例: managed）。per-call の失敗とは別軸。
- **per-call 導出失敗**: 導出能力のある runtime（`canDeriveChangedFiles() === true`）で、個別の `listChangedFiles` 呼び出しが失敗すること。
- **fail-closed consumer**: scope-check・reviewer activation gate。導出不能を「変更なし」と区別し、検証不能として安全側（UNKNOWN 合成 / reviewer 活性化）へ倒す。
- **挙動保存 consumer**: round-invalidation・no-op-detect。導出不能を no-signal（空相当）として扱い現挙動を保存する。

## Requirements

### Requirement: 変更ファイル観測 seam は「導出成功」と「導出不能」を戻り値で区別する

`RuntimeStrategy.listChangedFiles` は、changed-files を機械的に確定できた場合と確定できなかった場合を、判別共用体 `ChangedFilesResult` の戻り値で **区別しなければならない（MUST）**。導出成功は変更ファイル集合（空を含む）を、導出不能は診断文字列を伴う。seam は例外を **throw してはならない（MUST NOT）**。導出不能を導出成功（空の変更集合）と同一視して **はならない（MUST NOT）**。

seam の error 情報は診断文字列に限定し、port が domain 型へ依存して **はならない（MUST NOT）**。domain のエラー表現・UNKNOWN finding の rationale への写像は consumer が担う。

#### Scenario: 導出成功は変更ファイル集合を伴って返る

**Given** runtime が changed-files を機械的に確定できる
**When** consumer が `listChangedFiles(baseBranch, cwd, branch)` を呼ぶ
**Then** 戻り値は導出成功であり、repo 相対の変更ファイル集合（空を含む）を伴う

#### Scenario: 空の変更集合は「変更なし」を意味する

**Given** runtime が changed-files を確定でき、変更が 0 件である
**When** consumer が `listChangedFiles(baseBranch, cwd, branch)` を呼ぶ
**Then** 戻り値は導出成功であり、変更ファイル集合は空である
**And** これは導出不能とは区別される

#### Scenario: 導出不能は診断文字列を伴って返る

**Given** runtime が changed-files を機械的に確定できない
**When** consumer が `listChangedFiles(baseBranch, cwd, branch)` を呼ぶ
**Then** 戻り値は導出不能であり、原因を示す診断文字列を伴う
**And** seam は例外を throw しない

### Requirement: local runtime は git diff 失敗を導出不能として返す

local runtime の `listChangedFiles` は、`git diff --name-only <base>...HEAD` が **exit 0 で完了したときのみ導出成功**（変更ファイル集合を伴う）を返さなければならない（MUST）。`git diff` の **非ゼロ終了・spawn 例外・その他例外**のときは **導出不能**を返さなければならず（MUST）、その診断文字列に exit code またはエラー概要を含めなければならない（MUST）。これらの失敗経路で空の導出成功（`{kind:"success", files:[]}`）を返して **はならない（MUST NOT）**。local runtime の `canDeriveChangedFiles()` は `true` を返し続けなければならない（MUST）。

#### Scenario: git diff が exit 0 なら導出成功

**Given** local worktree で `git diff --name-only <base>...HEAD` が exit 0 で完了する
**When** `listChangedFiles(baseBranch, cwd, branch)` を呼ぶ
**Then** 戻り値は導出成功であり、変更ファイルを repo 相対 path で伴う（空行は除去される）

#### Scenario: git diff が非ゼロ終了なら導出不能

**Given** local worktree で `git diff` が非ゼロで終了する
**When** `listChangedFiles(baseBranch, cwd, branch)` を呼ぶ
**Then** 戻り値は導出不能であり、診断文字列に exit code を含む
**And** 空の導出成功は返らない

#### Scenario: spawn 例外なら導出不能

**Given** `git diff` の spawn が例外を投げる（git 不在等）
**When** `listChangedFiles(baseBranch, cwd, branch)` を呼ぶ
**Then** 戻り値は導出不能であり、診断文字列にエラー概要を含む
**And** 空の導出成功は返らない

### Requirement: managed runtime は導出不能を返す

managed runtime の `listChangedFiles` は、local worktree を持たず changed-files を構造的に導出できない事実を反映し、**導出不能**を返さなければならない（MUST）。診断文字列に導出不能の理由（local worktree 不在）を含めなければならない（MUST）。managed runtime の `canDeriveChangedFiles()` は `false` を返し続けなければならず（MUST）、DU 化はこの predicate を置換・削除して **はならない（MUST NOT）**。

#### Scenario: managed は常に導出不能を返す

**Given** managed runtime（local worktree を持たない）
**When** `listChangedFiles(baseBranch, cwd, branch)` を任意の引数で呼ぶ
**Then** 戻り値は導出不能であり、診断文字列に理由を含む
**And** 空の導出成功は返らない

### Requirement: scope-check は導出不能を UNKNOWN 合成で fail-closed 化する

scope-check（checkpoint judge step の scope 合成）は、`canDeriveChangedFiles() === false`（構造的非導出）のとき **`listChangedFiles` を呼ばず** UNKNOWN decision-needed finding を合成する既存挙動を維持しなければならない（MUST）。加えて、`canDeriveChangedFiles()` が `false` でない（導出能力のある）runtime で `listChangedFiles` が **導出不能**を返したとき、**同一の UNKNOWN decision-needed finding を合成しなければならない（MUST）**——構造的非導出と per-call 失敗を相補で塞ぐ。導出成功のときは従来どおり `deriveScopeBreach` で breach を導出しなければならない（MUST）。導出不能を「変更なし（breach なし）」として素通りさせて **はならない（MUST NOT）**。UNKNOWN 合成には既存 `synthesizeScopeUnverifiableFinding` を再利用し、新しい escalation 機構を作って **はならない（MUST NOT）**。

#### Scenario: 導出能力のある runtime で導出不能なら UNKNOWN を合成する（fail-closed）

**Given** `permissionScope` を宣言する pipeline の checkpoint step で、runtime が `canDeriveChangedFiles() === true` かつ `listChangedFiles` が導出不能を返す
**When** scope-check が scope findings を計算する
**Then** UNKNOWN decision-needed finding（origin:"scope"、resolution:"decision-needed"、severity:"high"、options ≥2）が合成される
**And** verdict は escalation になる
**And** 従来の fail-open 素通り（breach なし判定）は起きない

#### Scenario: 構造的非導出では従来どおり listChangedFiles を呼ばず UNKNOWN を合成する

**Given** checkpoint step で runtime が `canDeriveChangedFiles() === false`
**When** scope-check が scope findings を計算する
**Then** `listChangedFiles` は呼ばれない
**And** UNKNOWN decision-needed finding が合成される

#### Scenario: 導出成功なら従来どおり breach を導出する

**Given** checkpoint step で runtime が `canDeriveChangedFiles() === true` かつ `listChangedFiles` が導出成功（変更ファイル集合付き）を返す
**When** scope-check が scope findings を計算する
**Then** `deriveScopeBreach` が変更ファイル集合に対し従来どおり実行される
**And** forbidden surface に抵触すれば breach finding が、しなければ空が返る

### Requirement: reviewer activation gate は導出不能を reviewer 活性化で fail-closed 化する

reviewer activation gate は、`canDeriveChangedFiles() === false`（構造的非導出）のとき `listChangedFiles` を呼ばず `changedFilesDerivable: false` で `paths` 条件付き reviewer を活性化する既存挙動を維持しなければならない（MUST）。加えて、導出能力のある runtime で `listChangedFiles` が **導出不能**を返したとき、**`changedFilesDerivable: false`（changed-files は空）で `evaluateActivation` に渡し、`paths` 条件付き reviewer を活性化しなければならない（MUST）**——skip して **はならない（MUST NOT）**。導出成功のときは変更ファイル集合で従来どおり `paths` 条件を評価しなければならない（MUST）。活性化には既存の `changedFilesDerivable` 経路を再利用し、`evaluateActivation` のロジックを変更して **はならない（MUST NOT）**。

#### Scenario: 導出能力のある runtime で導出不能なら paths reviewer を活性化する（fail-closed）

**Given** `paths` 条件付き reviewer の activation gate で、runtime が `canDeriveChangedFiles() === true` かつ `listChangedFiles` が導出不能を返す
**When** activation gate が起動判定を行う
**Then** reviewer は活性化され（agent が呼ばれる）、skip されない
**And** step 結果は `skipped` verdict にならない

#### Scenario: 導出成功なら従来どおり paths 条件を評価する

**Given** `paths` 条件付き reviewer で、runtime が導出成功（変更ファイル集合付き）を返す
**When** activation gate が起動判定を行う
**Then** 変更ファイルが `paths` glob に一致すれば活性化、一致しなければ `skipped`（従来挙動）

### Requirement: round-invalidation・no-op-detect は導出不能を no-signal として扱い現挙動を保存する

round-invalidation（`ParallelReviewRound`）と no-op-detect は、`listChangedFiles` が **導出不能**を返したとき、それを **no-signal（空の変更集合相当）** として扱わなければならない（MUST）。これにより現挙動が保存される: managed runtime の invalidation 不発（fail-safe）は不変でなければならず（MUST）、no-op-detect の source 変更 0 → `needs-fix` escalate 方向は不変でなければならない（MUST）。これらの consumer を導出不能で fail-closed 化して **はならない（MUST NOT）**（現挙動保存）。導出成功のときは変更ファイル集合で従来どおり処理しなければならない（MUST）。

#### Scenario: managed runtime の invalidation 不発が保存される

**Given** managed runtime（`listChangedFiles` が導出不能を返す）で approved member を持つ round
**When** round-invalidation が member の touched files を評価する
**Then** touched files は空として扱われ、invalidation は発火しない（fail-safe 保存）

#### Scenario: no-op-detect は導出不能でも source 変更 0 として escalate 方向を保存する

**Given** noOpDetect 対象 step で `listChangedFiles` が導出不能を返す
**When** no-op-detect が source 変更を判定する
**Then** source 変更は 0 件として扱われ、no-op 判定（`needs-fix` への escalate 方向）が保存される

#### Scenario: 導出成功なら従来どおり処理する

**Given** local runtime で `listChangedFiles` が導出成功（変更ファイル集合付き）を返す
**When** round-invalidation / no-op-detect が変更を評価する
**Then** 変更ファイル集合に対し従来どおりの invalidation 判定 / no-op 判定が行われる

### Requirement: capability predicate は DU と相補で維持される

`canDeriveChangedFiles()` predicate は DU 化により置換・削除して **はならない（MUST NOT）**。predicate は **構造的非導出**（runtime が原理的に導出できるか）を、DU の `unavailable` は **per-call 導出失敗**（個別呼び出しが失敗したか）を担う相補である。両者は二重化ではなく、それぞれ異なる軸を表す。B-11（具象 runtime が `RealRuntimeStrategy` を implements し能力メソッドを必須化する）は維持されなければならない（MUST）。

#### Scenario: predicate と DU が別軸を担う

**Given** local runtime（`canDeriveChangedFiles() === true`）
**When** `listChangedFiles` が git 失敗で導出不能を返す
**Then** predicate は `true`（構造的には導出可能）でありながら、DU は `unavailable`（この呼び出しは失敗）を返す
**And** 両者は矛盾せず、それぞれ構造的能力と per-call 結果を表す
