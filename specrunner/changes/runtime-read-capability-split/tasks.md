# Tasks: RuntimeStrategy の read-only consumer を consumer-owned capability へ分割する

## T-01: capability interface を `src/core/port/runtime-strategy.ts` に追加する

既存の DU 型定義（`ChangedFilesResult`、`CommitFileResult`、`RevisionContentPair`）の直後に 3 つの named capability interface を export する。

- [ ] `ChangedFilesCapability` を追加する
  ```ts
  export interface ChangedFilesCapability {
    canDeriveChangedFiles?(): boolean;
    listChangedFiles(
      baseBranch: string,
      cwd: string,
      branch: string | null,
    ): Promise<ChangedFilesResult>;
  }
  ```
- [ ] `CommitInspectionCapability` を追加する
  ```ts
  export interface CommitInspectionCapability {
    listCommitChangedFiles?(oid: string, cwd: string): Promise<ChangedFilesResult>;
  }
  ```
- [ ] `RevisionContentCapability` を追加する
  ```ts
  export interface RevisionContentCapability {
    readRevisionContent?(
      file: string,
      priorOid: string,
      cwd: string,
      branch: string | null,
    ): Promise<RevisionContentPair>;
  }
  ```
- [ ] 3 つの interface が `src/core/port/runtime-strategy.ts` から export されていることを確認する（他ファイルが `import type { ChangedFilesCapability, CommitInspectionCapability, RevisionContentCapability } from "../port/runtime-strategy.js"` で取り込める）

**Acceptance Criteria**:
- `ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability` が `src/core/port/runtime-strategy.ts` から named export されている
- 3 interface はいずれも単独で動作し、単一の mega-interface に統合されていない
- 既存の `RuntimeStrategy`・`RealRuntimeStrategy` 定義に変更がない
- `bun run typecheck` が通る

---

## T-02: `no-op-detect.ts` を `ChangedFilesCapability` に絞り込む

- [ ] `import type { RuntimeStrategy } from "../port/runtime-strategy.js"` を `import type { ChangedFilesCapability } from "../port/runtime-strategy.js"` に変更する（`ChangedFilesResult` を参照している場合は追加 import）
- [ ] `detectNoOp` の第 2 引数 `runtimeStrategy: RuntimeStrategy` を `runtimeStrategy: ChangedFilesCapability` へ変更する
- [ ] 関数本体は変更しない（`runtimeStrategy.listChangedFiles(...)` は `ChangedFilesCapability` に存在する）
- [ ] `tests/unit/core/step/no-op-detect.test.ts` が存在する場合、fake を確認し `RuntimeStrategy` 全体を mock している箇所を `ChangedFilesCapability` のみで構築できる形に書き換える（forced cast を除去する）
- [ ] test fake が `{ listChangedFiles: vi.fn() }` のような minimal object で構築でき `as unknown as RuntimeStrategy` 不要であることを確認する

**Acceptance Criteria**:
- `no-op-detect.ts` が `RuntimeStrategy` を import しない
- `detectNoOp` の型シグネチャが `ChangedFilesCapability` を使っている
- 既存テストが pass する
- 対象テスト内に新規 `as unknown as RuntimeStrategy` が存在しない

---

## T-03: `finding-recency.ts` を `RevisionContentCapability` に絞り込む

- [ ] `import type { RuntimeStrategy } from "../port/runtime-strategy.js"` を `import type { RevisionContentCapability } from "../port/runtime-strategy.js"` に変更する
- [ ] `computeFindingRecency` の第 5 引数 `runtimeStrategy: RuntimeStrategy` を `runtimeStrategy: RevisionContentCapability` へ変更する
- [ ] `RecordFindingRecencyParams` インターフェースの `runtimeStrategy: RuntimeStrategy` を `runtimeStrategy: RevisionContentCapability` へ変更する
- [ ] 関数本体のガード `if (typeof runtimeStrategy.readRevisionContent !== "function")` はそのまま維持する（`RevisionContentCapability` でも `readRevisionContent` は optional のため正当）
- [ ] `runtimeStrategy.readRevisionContent!(...)` の non-null assertion はそのまま維持する（ガードが通った後なので安全）
- [ ] `tests/unit/core/step/finding-recency.test.ts` の forced cast を除去する
  - 行 83 付近の `as unknown as RuntimeStrategy` を `RevisionContentCapability` な narrow object に書き換える
  - 行 109 付近の `as unknown as RuntimeStrategy` を同様に書き換える
  - `makeFakeRuntime()` / `makeFakeRuntimeNoReadRevision()` ヘルパーが `RevisionContentCapability` 型のオブジェクトのみで構築されるよう変更する（28 メソッドの full fake は不要）

**Acceptance Criteria**:
- `finding-recency.ts` が `RuntimeStrategy` を import しない
- `computeFindingRecency` と `RecordFindingRecencyParams` の型シグネチャが `RevisionContentCapability` を使っている
- `finding-recency.test.ts` の `as unknown as RuntimeStrategy` が 0 になる
- 既存テストが pass する（indeterminate / late / not-late の全 case）

---

## T-04: `prior-round-context.ts` を `CommitInspectionCapability` に絞り込む

- [ ] `import type { RuntimeStrategy } from "../port/runtime-strategy.js"` を `import type { CommitInspectionCapability } from "../port/runtime-strategy.js"` に変更する
- [ ] `derivePriorRoundContext` の params 内 `runtimeStrategy: RuntimeStrategy | undefined` を `runtimeStrategy: CommitInspectionCapability | undefined` へ変更する
- [ ] 関数本体のガード `if (!runtimeStrategy?.listCommitChangedFiles) return null;` はそのまま維持する
- [ ] 関数本体の `runtimeStrategy.listCommitChangedFiles(priorOid, cwd)` 呼び出しはそのまま維持する
- [ ] 対応するテストファイルが存在する場合、fake を `CommitInspectionCapability` で構築できる形に変更する

**Acceptance Criteria**:
- `prior-round-context.ts` が `RuntimeStrategy` を import しない
- `derivePriorRoundContext` の型シグネチャが `CommitInspectionCapability` を使っている
- 既存テストが pass する（null degrade 含む）

---

## T-05: `post-fix-context.ts` を `CommitInspectionCapability` に絞り込む

- [ ] `import type { RuntimeStrategy } from "../port/runtime-strategy.js"` を `import type { CommitInspectionCapability } from "../port/runtime-strategy.js"` に変更する
- [ ] `derivePostFixContext` の params 内 `runtimeStrategy: RuntimeStrategy | undefined` を `runtimeStrategy: CommitInspectionCapability | undefined` へ変更する
- [ ] 関数本体のガード `if (!runtimeStrategy?.listCommitChangedFiles) return null;` はそのまま維持する
- [ ] 関数本体の `runtimeStrategy.listCommitChangedFiles(commitOid, cwd)` 呼び出しはそのまま維持する
- [ ] 対応するテストファイルが存在する場合、fake を `CommitInspectionCapability` で構築できる形に変更する

**Acceptance Criteria**:
- `post-fix-context.ts` が `RuntimeStrategy` を import しない
- `derivePostFixContext` の型シグネチャが `CommitInspectionCapability` を使っている
- 既存テストが pass する（null degrade 含む）

---

## T-06: `custom-reviewer-round-context.ts` を `CommitInspectionCapability` に絞り込む

- [ ] `import type { RuntimeStrategy } from "../port/runtime-strategy.js"` を `import type { CommitInspectionCapability } from "../port/runtime-strategy.js"` に変更する
- [ ] `deriveCustomReviewerPriorRound` の params 内 `runtimeStrategy: unknown` を `runtimeStrategy: CommitInspectionCapability | undefined` へ変更する
- [ ] 関数本体の `const strategy = runtimeStrategy as RuntimeStrategy | undefined;` キャスト行を削除する
- [ ] キャスト後に `strategy` を使っていた箇所を `runtimeStrategy` に置き換える
  - `if (!strategy?.listCommitChangedFiles) return null;` → `if (!runtimeStrategy?.listCommitChangedFiles) return null;`
  - `await strategy.listCommitChangedFiles(...)` → `await runtimeStrategy.listCommitChangedFiles(...)`
- [ ] 対応するテストファイルが存在する場合、fake を `CommitInspectionCapability` で構築できる形に変更する

**Acceptance Criteria**:
- `custom-reviewer-round-context.ts` が `RuntimeStrategy` を import しない
- `deriveCustomReviewerPriorRound` の params 内 `runtimeStrategy` が `CommitInspectionCapability | undefined` 型になっている
- `as RuntimeStrategy` キャストが完全に除去されている
- 既存テストが pass する（null degrade 含む）

---

## T-07: `scope-check.ts` の `deps` 型を構造的最小型に絞り込む

- [ ] `import type { PipelineDeps } from "../types.js"` を削除する
- [ ] `RuntimeStrategy` を直接 import していた場合は削除する（現状は PipelineDeps 経由のため直接 import はない）
- [ ] `import type { ChangedFilesCapability } from "../port/runtime-strategy.js"` を追加する
- [ ] `computeExtraScopeFindings` の `deps: PipelineDeps` 引数を次の構造的最小型へ変更する:
  ```ts
  deps: {
    slug: string;
    request: { baseBranch?: string };
    cwd?: string;
    runtimeStrategy: ChangedFilesCapability | undefined;
  }
  ```
- [ ] 関数本体（`deps.slug`、`deps.request.baseBranch`、`deps.cwd`、`deps.runtimeStrategy`、`deps.runtimeStrategy.canDeriveChangedFiles`、`deps.runtimeStrategy.listChangedFiles`）はすべてそのまま維持する
- [ ] 呼び出し元（`executor.ts`）のコード変更は不要であることを確認する（`PipelineDeps` は structural typing で新型を満たす）
- [ ] 対応するテストファイルが存在する場合、fake を最小型で構築できる形に確認する

**Acceptance Criteria**:
- `scope-check.ts` が `PipelineDeps` を import しない
- `scope-check.ts` が `RuntimeStrategy` を import しない
- `computeExtraScopeFindings` の `deps` 引数型が最小構造型になっている
- `executor.ts` に変更が不要（または最小限の型調整のみ）
- 既存テストが pass する（fail-closed / UNKNOWN finding 生成 含む）

---

## T-08: `achieved-assurance.ts` と `runtime-capability-gate.ts` を整理する

### `achieved-assurance.ts`

- [ ] `AssuranceProvenanceRuntime` を Pick エイリアスから explicit interface へ変更する:
  - Before: `export type AssuranceProvenanceRuntime = Pick<RuntimeStrategy, 'readFileAtCommit'>`
  - After:
    ```ts
    export interface AssuranceProvenanceRuntime {
      readFileAtCommit?(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
    }
    ```
- [ ] `CommitFileResult` を `src/core/port/runtime-strategy.ts` から import する
- [ ] `import type { RuntimeStrategy } from "../port/runtime-strategy.js"` を削除する（不要になる）
- [ ] 関数本体（`runtime.readFileAtCommit?.(...)` 等）はそのまま維持する

### `runtime-capability-gate.ts`

- [ ] `import type { RuntimeStrategy } from "../port/runtime-strategy.js"` を `import type { ChangedFilesCapability } from "../port/runtime-strategy.js"` に変更する
- [ ] `assertRuntimeSupportsScope` の第 2 引数型 `Pick<RuntimeStrategy, 'canDeriveChangedFiles'>` を `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>` へ変更する
- [ ] 関数本体（`runtime.canDeriveChangedFiles?.() === false`）はそのまま維持する

**Acceptance Criteria**:
- `achieved-assurance.ts` が `RuntimeStrategy` を import しない
- `AssuranceProvenanceRuntime` が explicit interface として定義されている
- `runtime-capability-gate.ts` が `RuntimeStrategy` を import しない
- `assertRuntimeSupportsScope` の型シグネチャが `ChangedFilesCapability` を参照している
- 既存テストが pass する（fail-closed の assurance gate 含む）

---

## T-09: capability contract test を追加する（Local/Managed の capability 実装確認）

新ファイル `tests/unit/core/runtime/capability-contracts.test.ts` を作成する。

- [ ] `LocalRuntime`（`src/core/runtime/local.ts`）と `ManagedRuntime`（`src/core/runtime/managed.ts`）のインスタンスが各 capability を構造的に満たすことを TypeScript assignability でコンパイル時に検証するテストを書く
  ```ts
  // 例: LocalRuntime instance を ChangedFilesCapability に代入できること
  const runtime = buildTestLocalRuntime(); // 適切な構築方法を確認して使う
  const _cf: ChangedFilesCapability = runtime;
  const _ci: CommitInspectionCapability = runtime;
  const _rv: RevisionContentCapability = runtime;
  ```
- [ ] ManagedRuntime も同様に検証する
- [ ] `AssuranceProvenanceRuntime` についても Local/Managed が満たすことを検証する
- [ ] テストが `it`/`test` ブロック内で行われること（vitest が認識できる形式）
- [ ] テスト本体はコンパイル検証が目的のため、runtime assertion（expect）は不要（型代入できることが確認できれば十分）

**Acceptance Criteria**:
- テストファイルが作成されており、LocalRuntime と ManagedRuntime が全 capability を満たすことがコンパイル時に検証されている
- `bun run typecheck` が通る（型代入エラーがない）
- `bun run test` でテストが pass する（ランタイムエラーがない）

---

## T-10: leaf consumer 非退行 compile-time テストを追加する

対象 consumer 関数が `RuntimeStrategy` 全体を使わず capability 型だけで呼び出せることを保証するテストを追加する。

- [ ] `tests/unit/core/step/capability-consumers.test.ts` を作成する（またはすでにあるテストファイルに追加する）
- [ ] 各 consumer 関数を narrow 型オブジェクトのみで呼び出す呼び出しテストを追加する:
  - `detectNoOp`: `{ listChangedFiles: vi.fn() }` のような `ChangedFilesCapability` 型オブジェクトで呼び出せること
  - `computeFindingRecency`: `RevisionContentCapability` 型オブジェクトで呼び出せること
  - `derivePriorRoundContext`: `CommitInspectionCapability | undefined` で呼び出せること
  - `derivePostFixContext`: 同上
  - `deriveCustomReviewerPriorRound`: 同上
  - `computeExtraScopeFindings`: `ChangedFilesCapability | undefined` を含む最小 deps で呼び出せること
- [ ] これらは型チェックが通ることが目的のため、テスト本体はシンプルで良い（stub の戻り値を返す vi.fn() 等）

**Acceptance Criteria**:
- narrow 型のみで consumer 関数が呼び出せることが型レベルで確認されている
- `RuntimeStrategy` 型を明示的に使わずともテストがコンパイル・passする
- `bun run typecheck` が通る

---

## T-11: `architecture/components.md` を更新する

- [ ] `RuntimeStrategy — runtime 中立の実行基盤 seam` セクションの責務説明から「commit 時テスト実行」等の削除済み機能への言及を除去する（行 171 付近の stale 記述を現状に合わせる）
- [ ] `RuntimeStrategy` が composition root 向け facade であることを明示する記述を追加または強化する
- [ ] read-only leaf consumer が consumer-owned capability に依存することを説明する記述を追加する（例: 「`ChangedFilesCapability` / `CommitInspectionCapability` / `RevisionContentCapability` などの narrow capability に依存し、full `RuntimeStrategy` を参照しない」）
- [ ] concrete runtime（LocalRuntime / ManagedRuntime）が capability を structural typing で満たすことを説明する
- [ ] 変更は既存レイヤーの責務を変えるものではなく、依存境界を明確化するもの（refactoring）と分かるように記述する

**Acceptance Criteria**:
- `architecture/components.md` に「commit 時テスト実行」等の stale 言及が残っていない
- `RuntimeStrategy` が composition root facade であることが明示されている
- consumer-owned capability パターンが文書化されている
- 既存の他セクション（層の責務、不変条件等）に変更がない

---

## T-12: ビルド・型チェック・テスト・lint の全 green 確認

- [ ] `bun run build` が通る
- [ ] `bun run typecheck` が通る
- [ ] `bun run lint` が通る
- [ ] `bun run test` が通る（全既存テスト pass、新規テスト pass）
- [ ] scope 外の未追跡ファイルが commit に含まれていないことを確認する
- [ ] 実測値（PR 本文用）を収集する:
  - `src/core/port/runtime-strategy.ts` の行数 after
  - `as unknown as RuntimeStrategy` の残存件数 (before: 6 / after: target ≤ 3 ※ e2e mock は対象外)
  - full-interface consumer 数 after（RuntimeStrategy を parameter type として要求するファイル数）
  - capability ごとの consumer 数
  - 対象 test fake の forced cast 数 after（target: 0）

**Acceptance Criteria**:
- build / typecheck / lint / test がすべて green
- 対象 consumer の `RuntimeStrategy` 全体依存数が単調減少している
- 対象 test fake の forced cast が 0 になっている
