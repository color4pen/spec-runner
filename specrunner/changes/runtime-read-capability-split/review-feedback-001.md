# Code Review Feedback — runtime-read-capability-split — Iteration 1

## Summary

このレビューは `git diff main...HEAD` の全変更（実装ファイル 9 本、テストファイル 2 本、architecture ドキュメント 1 本）を対象として実施した。build / typecheck / lint / test はすべて green（verification-result.md 確認済み）。refactoring の主目的（read-only leaf consumer を consumer-owned capability へ絞り込む）は達成されており、forced cast の除去・型安全性の向上・architecture 文書の更新も適切に実施されている。

軽微な test coverage ギャップ 2 件と stale comment 1 件を以下に報告する。

---

## Findings

### F-001: TC-005 / TC-020（must）が直接 unit test でカバーされていない

**Severity**: medium  
**File**: `tests/unit/core/step/capability-consumers.test.ts`

**状況**

test-cases.md は次の 2 件を `priority: must` として記載している。

- TC-005: `listChangedFiles` が `unavailable` を返したとき `detectNoOp` がどう振る舞うか
- TC-020: 同（既存挙動維持の観点）

`capability-consumers.test.ts` の TC-004 では `{ kind: "success", files: [] }` を返す fake を渡して no-op が検出されることを確認しているが、`{ kind: "unavailable", reason: "..." }` を返す fake でのパスは直接テストされていない。

コード側の挙動は明示的にコメントで説明されている（`// Behavior preservation: unavailable ... treated as empty`）が、TC として明示された must ケースのテストが欠けている。

**参照コード（`src/core/step/no-op-detect.ts` L70–78）**

```ts
const result = await runtimeStrategy.listChangedFiles(...);
// Behavior preservation: unavailable (managed runtime, local transient failure) is
// treated as empty (no-signal). This keeps the no-op escalation direction safe.
const changedFiles = result.kind === "success" ? result.files : [];
```

**修正方針**

`capability-consumers.test.ts` または `no-op-detect` 専用のテストファイルに次のケースを追加する。

```ts
it("listChangedFiles returns unavailable → changedFiles treated as empty → no-op detected", async () => {
  const narrow: ChangedFilesCapability = {
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "unavailable", reason: "git error" }),
  };
  const result = await detectNoOp(step, narrow, { ...params, completionReason: "success" });
  expect(result).toBe("needs-fix"); // empty changedFiles → no source files → no-op
});
```

**補足**: TC-005 の title（"no-op とみなさない"）と Scenario 名（"変更ファイルは空として扱われる"）が矛盾しているように見える。`unavailable` → changedFiles 空 → no-op 検出（`"needs-fix"`）が実際の挙動であり、title の "とみなさない" は誤記の可能性がある。テストを追加しつつ TC の title も修正すること。

---

### F-002: TC-010 / TC-021（must）が直接 unit test でカバーされていない

**Severity**: medium  
**File**: `tests/unit/core/step/capability-consumers.test.ts`

**状況**

test-cases.md は次の 2 件を `priority: must` として記載している。

- TC-010: `listCommitChangedFiles` が absent のとき commit inspection consumer が `null` を返す
- TC-021: `listCommitChangedFiles` が `unavailable` を返したとき `prior-round-context` が `null` を返す

`capability-consumers.test.ts` の TC-009 では `runtimeStrategy: {}` (empty object) + `iteration: 1` を渡しているが、`iteration < 2` のガードが先に発火するため `listCommitChangedFiles` チェックには到達しない。iteration ≥ 2 かつ priorOid が存在する状態で `listCommitChangedFiles` が absent / `unavailable` を返すパスが未テスト。

**コード参照（`src/core/step/prior-round-context.ts` L143–147）**

```ts
if (!runtimeStrategy?.listCommitChangedFiles) return null;

const result = await runtimeStrategy.listCommitChangedFiles(priorOid, cwd);
if (result.kind !== "success") return null;
```

**修正方針**

`capability-consumers.test.ts` に以下を追加する。

```ts
// TC-010: listCommitChangedFiles absent at iteration≥2 → null
it("listCommitChangedFiles absent + iteration 2 → null degrade", async () => {
  const narrow: CommitInspectionCapability = {}; // no listCommitChangedFiles
  const state = makeStateWithSpecFixerOid("abc123"); // priorOid resolvable
  const result = await derivePriorRoundContext({
    state: state as never, iteration: 2, cwd: "/cwd", runtimeStrategy: narrow,
  });
  expect(result).toBeNull();
});

// TC-021: listCommitChangedFiles returns unavailable → null
it("listCommitChangedFiles returns unavailable + iteration 2 → null degrade", async () => {
  const narrow: CommitInspectionCapability = {
    listCommitChangedFiles: vi.fn().mockResolvedValue({ kind: "unavailable", reason: "git error" }),
  };
  const state = makeStateWithSpecFixerOid("abc123");
  const result = await derivePriorRoundContext({
    state: state as never, iteration: 2, cwd: "/cwd", runtimeStrategy: narrow,
  });
  expect(result).toBeNull();
});
```

---

### F-003: `achieved-assurance.test.ts` の stale コメント

**Severity**: low  
**File**: `src/core/archive/__tests__/achieved-assurance.test.ts`  
**Line**: 140

**状況**

```ts
// The AssuranceProvenanceRuntime is narrowed to Pick<RuntimeStrategy, "readFileAtCommit">.
```

T-08 の変更（D3）により `AssuranceProvenanceRuntime` は `Pick<RuntimeStrategy, 'readFileAtCommit'>` エイリアスから explicit interface へ昇格した。上記コメントは旧定義を指しており、現行コードと齟齬がある。

**修正方針**

コメントを次のように更新する。

```ts
// The AssuranceProvenanceRuntime is a consumer-owned explicit interface
// (not Pick<RuntimeStrategy, "readFileAtCommit">).
```

---

## Positive Observations

- **forced cast 除去が完了している**: `as unknown as RuntimeStrategy` は E2E 全体 mock（`pipeline-sole-committer-e2e.test.ts` 2 件、`custom-reviewers-e2e.test.ts` 1 件、`pipeline-integration.test.ts` 1 件）のみに残存。これらは design.md Risk [E2E テスト] で対象外と明示されており、leaf consumer test fake の forced cast はゼロになっている（TC-019 達成）。

- **3 capability interface の定義が適切**: `ChangedFilesCapability` / `CommitInspectionCapability` / `RevisionContentCapability` は single mega-interface ではなく responsibility 境界ごとに分割されており、design D2 に準拠している。

- **contract test が実用的**: `capability-contracts.test.ts` の LocalRuntime / ManagedRuntime 代入テストは TypeScript assignability を直接コンパイル時に検証しており、runtime assertion 不要の設計が明快。

- **custom-reviewer-round-context.ts の型改善が完全**: `unknown` 経由キャストが完全に除去され、`CommitInspectionCapability | undefined` として明示的に型付けされた（T-06 / TC-011）。

- **architecture/components.md の更新が仕様に一致**: RuntimeStrategy を "composition root 向け facade" として明示、consumer-owned capability パターン・structural typing での充足を説明しており、T-11 の全 acceptance criteria を満たしている。

- **scope-check.ts の deps 型が構造的最小型に絞られている**: `PipelineDeps` 依存が完全に除去され、4 フィールドのインライン型（`slug`, `request`, `cwd`, `runtimeStrategy: ChangedFilesCapability | undefined`）に絞られている。executor.ts への変更も不要。

---

## 検証した項目

| 観点 | 確認結果 |
|---|---|
| 対象 8 leaf consumer の RuntimeStrategy 依存除去 | ✓ 完了 |
| 3 named capability interface の export | ✓ `src/core/port/runtime-strategy.ts:230–263` |
| AssuranceProvenanceRuntime explicit interface | ✓ `src/core/archive/achieved-assurance.ts:28–30` |
| forced cast 除去（leaf consumer scope） | ✓ 0件 |
| E2E forced cast（対象外・設計上許容） | 4 件残存（design.md Risk に明示） |
| capability-contracts.test.ts の存在と pass | ✓ verification-result.md L993 |
| capability-consumers.test.ts の存在と pass | ✓ verification-result.md L726 |
| TC-005 / TC-020 直接テスト | ✗ 欠如（F-001） |
| TC-010 / TC-021 直接テスト | ✗ 欠如（F-002） |
| TC-019 finding-recency forced cast 除去 | ✓ `makeFakeRuntime()` が `RevisionContentCapability` のみで構築 |
| build / typecheck / lint / test green | ✓ verification-result.md |
| architecture/components.md 更新 | ✓ L170–179 |
| stale コメント（achieved-assurance.test.ts L140） | ✗ 要修正（F-003） |
| PipelineDeps.runtimeStrategy が RuntimeStrategy \| undefined のまま維持 | ✓ `src/core/types.ts:91` |

## 検証できなかった項目

なし。全 acceptance criteria は git diff・ソースコード・テスト結果・architecture 文書を直接確認して検証した。
