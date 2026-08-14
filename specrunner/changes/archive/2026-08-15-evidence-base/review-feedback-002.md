# Code Review Feedback — evidence-base — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 実装ファイル

- `src/core/step/bite-evidence/oids.ts` — `resolveEvidenceBaseRev` (pure function, no I/O)。`synthesizedCommits[0]^` を返す。空/absent → null。`detectBaseImplementationContamination` の完全削除を確認。
- `src/core/step/bite-evidence/gate.ts` — deferral 順序 (D6) が step 1–6 に正しく実装されていることを確認。step 7 以降 (captureHeadSha → runTestsOnSynthesizedTree → runTestsAtCommit → records 構築) の実装を確認。never-throw wrapper、tamper 検出、FORWARD_TYPES が不変であることを確認。
- `src/core/archive/achieved-assurance.ts` — P2.5 (EB ref 不在時の fail-closed return) の実装を確認。P3 capability check に `runTestsOnSynthesizedTree` が追加されていることを確認。(e) base-red が `runTestsOnSynthesizedTree(evidenceBaseRev, materializedTestFiles, finalHeadOid)` に置換されていることを確認。
- `src/core/port/runtime-strategy.ts` — `runTestsOnSynthesizedTree` の contract JSDoc を確認。optional on `RuntimeStrategy`、`RealRuntimeStrategy` では required という設計を確認。
- `src/core/runtime/local.ts` — `runTestsOnSynthesizedTree` の実装を確認。worktree 作成 → overlay write → node_modules symlink → per-file scoped run → finally cleanup の 5 段階実装。`scopedTestCommand` 未設定時は unavailable を返す。worktreeCreated / symlinkCreated フラグで finally 内のクリーンアップを正確に制御していることを確認。
- `src/core/runtime/managed.ts` — `runTestsOnSynthesizedTree` が `unavailable` を返すことを確認。
- `src/state/schema/types.ts` — `BiteEvidenceRecord.baseOid` の型コメント更新 ("Evidence Base revision expression") を確認。

### テストカバレッジ

- `evidence-base-oids.test.ts` — TC-002: 5 ケース (first-run / resume / equality / empty / absent)。
- `evidence-base-gate.test.ts` — TC-003 / TC-006 / TC-007 / TC-008 / TC-009 / TC-010。
- `evidence-base-archive-floor.test.ts` — TC-004 / TC-005。
- `synthesized-tree-exec.test.ts` — TC-011 / TC-012 / TC-013 / TC-014 / TC-015 (real git repo + LocalRuntime integration)。
- `evidence-base-e2e.test.ts` — TC-001: re-run shape earns assurance (real git, real LocalRuntime)。
- 既存ファイルの更新 (D7 enumeration): `gate.test.ts` / `gate-empty-selection.test.ts` / `achieved-assurance.test.ts` / 5 unit test files / `bite-evidence-e2e-gate.test.ts` — 全て修正済み。
- D7 保持ファイル (oid-capture.test.ts / bite-evidence-isolated-exec.test.ts 等) が diff に含まれないことを確認。

### 撤去の確認 (TC-016)

`grep -rn detectBaseImplementationContamination src/` で production code にヒットなし（gate.test.ts のコメント行 1 件のみ）。typecheck green が structural removal の完全な証拠。

### verification-result.md

typecheck: passed。test: 774 files, 11 564 + 1 tests passed。

## 検証できなかった項目

- `runTestsOnSynthesizedTree` の actual test execution 動作 (real bun run) は sandbox 内でテスト実行できないため、TC-011〜014 の実装の正しさはコードレビューと test file の assertion による確認のみ。

## Findings 詳細

### F-001: `BiteEvidenceRecord.baseOid` が rev expression を格納 (naming mismatch)

**Severity**: low / fixable

`gate.ts:289`:
```typescript
baseOid: evidenceBaseRev, // Evidence Base rev (not the materialize commit)
```

`evidenceBaseRev` は `"abc1234^"` のような revision expression であり、resolved commit SHA ではない。型コメントは "Evidence Base revision expression" と明記しているが、`*Oid` という名前はプロジェクト内で常に resolved 40-char SHA を意味する。

現在 `BiteEvidenceRecord.baseOid` を git ref として直接使う production consumer はなく (archive floor は `resolveEvidenceBaseRev(state)` で独立再導出)、破壊はない。しかし `baseOid` という名前が将来のコードに `git show <baseOid>` での使用を誘発しうる。git はこの式を正しく解決するので実害はないが、他の `*Oid` フィールドと意味が異なる。

**Fix path**: フィールドを `baseRef` または `evidenceBaseRef` にリネームする。フィールドは optional (`baseOid?: string`) なので後方互換に段階的に移行可能。

### F-002: P2.5 の EB ref check が `testDerivation` も遮断する (over-coupling)

**Severity**: low / fixable

`achieved-assurance.ts:237-246` の P2.5 は `biteEvidence` と `testDerivation` の両方を一括で遮断する:

```typescript
const evidenceBaseRev = resolveEvidenceBaseRev(state);
if (evidenceBaseRev === null) {
  // 両 dimension が absent になる
  return { achieved: achieved as ProfileAssurance, diagnostics };
}
```

`testDerivation` (blob freeze + scenario revision binding) は EB ref を論理的に必要としない。`synthesizedCommits` を持たないが test-materialize commit を持つジョブ (`testDerivation: frozen` floor) の場合、EB ref 不在で `testDerivation` が absent になる。`achieved-assurance.test.ts` がこの挙動を明示的に pin しているので意図的設計。

実用上の影響: modern jobs は常に `synthesizedCommits` を持ち、`testDerivation: frozen` floor 単独 (biteEvidence なし) で `synthesizedCommits` が空のケースは稀。fail-closed であり安全側の挙動。

**Fix path**: `if (floorConstrainsBite)` でガードして `testDerivation` 評価が P2.5 をスキップするよう分岐する。pin テストも更新が必要。

### F-003: `bite-evidence-e2e-gate.test.ts` の `synthesizedCommits[0]` がテスト用簡略設定 (observation)

**Severity**: low / observation (fix 不要)

`bite-evidence-e2e-gate.test.ts:171`:
```typescript
// synthesizedCommits[0] = baseOid (test-materialize commit); [0]^ = pre-test commit
synthesizedCommits: [baseOid],
```

実際のジョブでは `synthesizedCommits[0]` は pipeline ステップ開始前に作成される bootstrap commit であり、test-materialize commit ではない。このテストは test-materialize commit を `[0]` として代用しており、`baseOid^` (= test-case-gen commit) がたまたま impl-absent な tree になることで正しく動作する。

`evidence-base-e2e.test.ts` では bootstrap commit が明示的に設定されており、こちらが AC-1 / AC-2 の正確な実証である。e2e-gate test は全体的な gate + floor E2E regression suite として機能しており、この簡略設定は許容範囲。
