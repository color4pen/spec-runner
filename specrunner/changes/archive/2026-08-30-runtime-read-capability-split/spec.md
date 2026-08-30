# Spec: RuntimeStrategy の read-only consumer を consumer-owned capability へ分割する

## Requirements

---

### Requirement: capability interface は named export として port ファイルから取り込める

`ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability` の 3 つが `src/core/port/runtime-strategy.ts` から named export され、consumer がそれぞれを単独で import できること。single mega-interface への統合は行わない。

The system SHALL export three distinct named capability interfaces from `src/core/port/runtime-strategy.ts`, each representing the minimal contract for its respective read-only concern.

#### Scenario: ChangedFilesCapability の import

**Given** consumer が `src/core/port/runtime-strategy.ts` を import できる環境にある
**When** consumer が `import type { ChangedFilesCapability } from "../port/runtime-strategy.js"` を宣言する
**Then** `ChangedFilesCapability` として `canDeriveChangedFiles?(): boolean` と `listChangedFiles(baseBranch, cwd, branch): Promise<ChangedFilesResult>` が利用可能になる

#### Scenario: CommitInspectionCapability の import

**Given** consumer が `src/core/port/runtime-strategy.ts` を import できる環境にある
**When** consumer が `import type { CommitInspectionCapability } from "../port/runtime-strategy.js"` を宣言する
**Then** `CommitInspectionCapability` として `listCommitChangedFiles?(oid, cwd): Promise<ChangedFilesResult>` が利用可能になる

#### Scenario: RevisionContentCapability の import

**Given** consumer が `src/core/port/runtime-strategy.ts` を import できる環境にある
**When** consumer が `import type { RevisionContentCapability } from "../port/runtime-strategy.js"` を宣言する
**Then** `RevisionContentCapability` として `readRevisionContent?(file, priorOid, cwd, branch): Promise<RevisionContentPair>` が利用可能になる

---

### Requirement: no-op-detect は ChangedFilesCapability のみを依存型として受け取る

`detectNoOp` 関数の第 2 引数は `RuntimeStrategy` 全体ではなく `ChangedFilesCapability` でなければならない。既存の `listChangedFiles` 呼び出しと `unavailable` 時の empty-list fallback 動作は変わらない。

The `detectNoOp` function MUST accept a `ChangedFilesCapability` as its runtime parameter, not a `RuntimeStrategy`.

#### Scenario: ChangedFilesCapability のみで detectNoOp を呼び出せる

**Given** caller が `{ listChangedFiles: vi.fn().mockResolvedValue({ kind: "success", files: [] }) }` という最小オブジェクトを用意している
**When** caller が `detectNoOp(step, minimalCapability, params)` を呼び出す
**Then** TypeScript がコンパイルエラーを出さずに呼び出しが成功する

#### Scenario: unavailable のとき変更ファイルは空として扱われる（動作の維持）

**Given** runtime が `{ kind: "unavailable", reason: "spawn error" }` を返す `ChangedFilesCapability` を持つ
**When** `detectNoOp` が listChangedFiles を呼び出す
**Then** changedFiles を `[]` として扱い（no-op とはみなさない）、`undefined` を返す

---

### Requirement: finding-recency は RevisionContentCapability のみを依存型として受け取る

`computeFindingRecency` と `RecordFindingRecencyParams.runtimeStrategy` は `RevisionContentCapability` を型として用いる。`readRevisionContent` が absent の場合のすべての finding が "indeterminate" になる既存動作は変わらない。

The `computeFindingRecency` function MUST accept a `RevisionContentCapability` as its runtime parameter, and SHALL degrade all findings to "indeterminate" when `readRevisionContent` is absent on the capability object.

#### Scenario: RevisionContentCapability のみで computeFindingRecency を呼び出せる

**Given** caller が `{ readRevisionContent: vi.fn() }` という最小オブジェクトを用意している
**When** caller が `computeFindingRecency(findings, priorOid, cwd, branch, minimalCapability)` を呼び出す
**Then** TypeScript がコンパイルエラーを出さずに呼び出しが成功する

#### Scenario: readRevisionContent が absent のとき全 finding が indeterminate になる（動作の維持）

**Given** `runtimeStrategy` が `{}` （readRevisionContent を持たない `RevisionContentCapability`）である
**When** `computeFindingRecency` が finding を分類しようとする
**Then** すべての finding の recency が `"indeterminate"` になる

#### Scenario: priorOid が null のとき全 finding が indeterminate になる（動作の維持）

**Given** `runtimeStrategy` が `readRevisionContent` を持つ `RevisionContentCapability` である
**And** `priorOid` が `null` である
**When** `computeFindingRecency` が実行される
**Then** すべての finding の recency が `"indeterminate"` になる

---

### Requirement: commit inspection consumer は CommitInspectionCapability のみを依存型として受け取る

`derivePriorRoundContext`、`derivePostFixContext`、`deriveCustomReviewerPriorRound` の各関数は `CommitInspectionCapability | undefined` を runtime 型として受け取る。`listCommitChangedFiles` が absent または result が unavailable のときに `null` へ degrade する既存動作は変わらない。

These three functions MUST accept a `CommitInspectionCapability | undefined` as their runtime parameter, and SHALL return `null` when `listCommitChangedFiles` is absent on the capability object or returns `unavailable`.

#### Scenario: CommitInspectionCapability のみで derivePriorRoundContext を呼び出せる

**Given** caller が `{ listCommitChangedFiles: vi.fn().mockResolvedValue({ kind: "success", files: ["src/foo.ts"] }) }` を用意している
**When** caller が `derivePriorRoundContext({ state, iteration: 2, cwd, runtimeStrategy: minimalCapability })` を呼び出す
**Then** TypeScript がコンパイルエラーを出さずに呼び出しが成功する

#### Scenario: listCommitChangedFiles が absent のとき null を返す（動作の維持）

**Given** `runtimeStrategy` が `{}` （listCommitChangedFiles を持たない `CommitInspectionCapability`）である
**When** `derivePriorRoundContext` / `derivePostFixContext` / `deriveCustomReviewerPriorRound` が実行される
**Then** `null` が返る（degrade）

#### Scenario: custom-reviewer-round-context で as cast が不要になる

**Given** caller が `CommitInspectionCapability | undefined` 型のオブジェクトを渡している
**When** `deriveCustomReviewerPriorRound` が内部で `listCommitChangedFiles` を呼び出す
**Then** `as RuntimeStrategy | undefined` のような forced cast なしに呼び出しが成功する

---

### Requirement: scope-check は ChangedFilesCapability を含む最小型の deps を受け取る

`computeExtraScopeFindings` の `deps` 引数は `PipelineDeps` 全体ではなく、`slug`・`request.baseBranch?`・`cwd?`・`runtimeStrategy: ChangedFilesCapability | undefined` のみを含む最小構造型を受け取る。既存の fail-closed 動作（canDeriveChangedFiles === false → UNKNOWN finding）は変わらない。

`computeExtraScopeFindings` MUST accept a structurally minimal deps type containing only the fields it actually uses, and SHALL NOT import `PipelineDeps` or `RuntimeStrategy`.

#### Scenario: 最小型の deps で computeExtraScopeFindings を呼び出せる

**Given** caller が `{ slug: "s", request: { baseBranch: "main" }, cwd: "/work", runtimeStrategy: changedFilesCap }` を用意している
**When** caller が `computeExtraScopeFindings(stepName, permissionScope, state, minimalDeps)` を呼び出す
**Then** TypeScript がコンパイルエラーを出さずに呼び出しが成功する

#### Scenario: PipelineDeps を渡した既存の呼び出し元が変更不要で動作する

**Given** `executor.ts` が `deps: PipelineDeps` を `computeExtraScopeFindings` に渡している
**When** TypeScript が structural typing でチェックする
**Then** `PipelineDeps` は最小型を満たすため、`executor.ts` へのコード変更なしにコンパイルが通る

#### Scenario: canDeriveChangedFiles === false で UNKNOWN finding が生成される（動作の維持）

**Given** `deps.runtimeStrategy.canDeriveChangedFiles?.()` が `false` を返す
**When** `computeExtraScopeFindings` が実行される
**Then** `synthesizeScopeUnverifiableFinding` が呼ばれ UNKNOWN decision-needed finding が返る

---

### Requirement: AssuranceProvenanceRuntime が explicit interface として定義される

`achieved-assurance.ts` の `AssuranceProvenanceRuntime` は `Pick<RuntimeStrategy, ...>` 型エイリアスではなく、`readFileAtCommit?` メソッドを直接宣言する explicit interface として定義される。`achieved-assurance.ts` は `RuntimeStrategy` を import しない。

`AssuranceProvenanceRuntime` MUST be defined as an explicit interface in `achieved-assurance.ts` without referencing `RuntimeStrategy`.

#### Scenario: AssuranceProvenanceRuntime が explicit interface で型付けされる

**Given** `achieved-assurance.ts` が更新されている
**When** `AssuranceProvenanceRuntime` の定義を確認する
**Then** `type ... = Pick<RuntimeStrategy, ...>` ではなく `interface AssuranceProvenanceRuntime { readFileAtCommit?(...): ... }` の形式になっている

#### Scenario: LocalRuntime インスタンスが AssuranceProvenanceRuntime として渡せる

**Given** `LocalRuntime` インスタンスが存在する
**When** `AssuranceProvenanceRuntime` 型の変数に代入する
**Then** TypeScript がコンパイルエラーを出さない（structural typing により満たされる）

---

### Requirement: LocalRuntime と ManagedRuntime が各 capability を structural typing で満たす

LocalRuntime と ManagedRuntime のインスタンスはそれぞれ `ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability`、`AssuranceProvenanceRuntime` を満たす。これは compile-time に検証される。

`LocalRuntime` and `ManagedRuntime` MUST be structurally assignable to each of the four capability interfaces defined in this change.

#### Scenario: LocalRuntime が ChangedFilesCapability を満たす（compile-time）

**Given** `LocalRuntime` インスタンスが存在する
**When** `const _: ChangedFilesCapability = local;` という代入を TypeScript がチェックする
**Then** コンパイルエラーが発生しない

#### Scenario: ManagedRuntime が CommitInspectionCapability を満たす（compile-time）

**Given** `ManagedRuntime` インスタンスが存在する
**When** `const _: CommitInspectionCapability = managed;` という代入を TypeScript がチェックする
**Then** コンパイルエラーが発生しない（ManagedRuntime.listCommitChangedFiles は optional なので空実装でも満たす）

---

### Requirement: 対象 consumer の test fake から forced cast が除去される

対象の leaf consumer に対する unit test の fake オブジェクトは、`as unknown as RuntimeStrategy` による forced cast を必要とせずに構築できる。

Test fakes for targeted leaf consumers SHALL be constructable using only the relevant capability type, without any `as unknown as RuntimeStrategy` cast.

#### Scenario: finding-recency のテスト fake が narrow 型で構築できる

**Given** `finding-recency.test.ts` が `computeFindingRecency` のテストを実行している
**When** runtime fake を構築する
**Then** `{ readRevisionContent: vi.fn() }` のような narrow オブジェクトを直接渡せて、`as unknown as RuntimeStrategy` cast が不要になる

---

### Requirement: 既存の観測可能な振る舞いが維持される

capability 分割は型境界の変更のみで、以下の動作をいずれも変えない。

The refactoring MUST NOT alter any observable behavior of the targeted consumers.

#### Scenario: listChangedFiles が unavailable のとき no-op-detect が no-op とみなさない（動作の維持）

**Given** `listChangedFiles` が `{ kind: "unavailable", reason: "spawn" }` を返す
**When** `detectNoOp` が実行される
**Then** `undefined` を返す（no-op とはみなさない）

#### Scenario: CommitInspectionCapability の listCommitChangedFiles が unavailable のとき prior-round-context が null を返す（動作の維持）

**Given** `listCommitChangedFiles` が `{ kind: "unavailable", reason: "no worktree" }` を返す
**When** `derivePriorRoundContext` が実行される
**Then** `null` が返る（degrade）

#### Scenario: runtime が undefined のとき prior/post-fix context が null を返す（動作の維持）

**Given** `runtimeStrategy` が `undefined` である
**When** `derivePriorRoundContext` または `derivePostFixContext` が実行される
**Then** `null` が返る（degrade）
