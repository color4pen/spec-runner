# Spec Review Result

## 検証した項目

### 1. コード前提の実地確認

**`pipelineManagedPaths` 現状（`src/core/pipeline/round-git-scope.ts:104-106`）**

```typescript
export function pipelineManagedPaths(slug: string): string[] {
  return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug), biteEvidenceResultPath(slug)];
}
```

request.md が主張する「4 要素・`prCreateResultPath` なし」を実地確認した。一致。

**`prCreateResultPath` の存在（`src/util/paths.ts:83-84`）**

```typescript
export function prCreateResultPath(slug: string): string {
  return `${CHANGES_DIR}/${slug}/pr-create-result.md`;
}
```

request.md の前提通り存在することを確認。

**単一ソースアーキテクチャの確認**

- `src/core/step/round-git-scope.ts` は `pipelineManagedPaths` を `../pipeline/round-git-scope.js` から re-export するだけの薄い転送ファイル。
- `commit-push.ts` の `import { pipelineManagedPaths } from "./round-git-scope.js"` (line 20) は同ファイル経由で `src/core/pipeline/round-git-scope.ts` の関数を参照。
- `commit-push.ts:451-455` の scoped mode:

  ```typescript
  const allManagedPaths = pipelineManagedPaths(slug);
  const existingManaged = await filterExistingFiles(allManagedPaths, cwd);
  const stagePaths = [...new Set([...filePaths, ...existingManaged])];
  ```

  → `pipelineManagedPaths` への追加は、offending 除外（`partitionRoundChanges`）と scoped 合成の staging（`commit-push.ts`）の両方に単一ソースで効くことを確認。design.md・request.md の主張通り。

**`cross-boundary-invariants.md` frontmatter の現状確認**

```yaml
---
name: cross-boundary-invariants
maxIterations: 2
paths:
  - src/core/pipeline/**
  - src/core/step/**
  - src/state/**
  - src/store/**
  - src/adapter/**
---
```

5 glob のみ。`src/core/runtime/**` と `src/core/verification/**` が欠落していることを確認。

**`src/core/runtime/` と `src/core/verification/` の存在確認**

両ディレクトリとも実在（各ファイル複数確認済み）。追加 glob が有効に機能することを確認。

**`evaluateActivation` の glob 照合ロジック確認（`src/core/reviewers/activation.ts`）**

```typescript
const matched = facts.changedFiles.some((file) =>
  cond.paths!.some((pattern) => matchGlob(pattern, file)),
);
```

frontmatter `paths` がそのまま `cond.paths` に渡されて glob 照合される。2 glob を追加することで runtime/verification 専変更時の skip が解消されることを確認。

### 2. テスト戦略の検証

**既存テスト構造（`src/core/pipeline/__tests__/round-git-scope.test.ts`）**

- `BITE_EVIDENCE` 定数は定義済み（line 28）。`pipelineManagedPaths` describe の `toContain(BITE_EVIDENCE)` のみで使われており、`partitionRoundChanges` ブロックに bite-evidence 専用テストは存在しない。
- T-02/T-03 の「#888 の bite-evidence 回帰テストと同型」は `pipelineManagedPaths` の containment test を指している。T-03 がさらに `partitionRoundChanges` テストを追加する点は bite-evidence より手厚い。

**T-02 と受け入れ基準 5 の関係**

受け入れ基準「既存の round-git-scope / bite-evidence テストは無改変で green」について：T-02 は `pipelineManagedPaths` describe の既存テスト（line 43-50）のテスト説明文・`toHaveLength(4)` を変更する。これは「更新」であり regression ではなく、partitionRoundChanges の各 scenario テスト（scenario 1〜5）と `excludeChangeFolderPaths` テストは無改変のまま。実質上の問題はない。

### 3. セキュリティ観点

- `pipelineManagedPaths` の引数 `slug` はパイプライン内部の検証済み識別子。ユーザー直接入力ではない。
- パス構築はすべてハードコードの文字列結合（`${CHANGES_DIR}/${slug}/pr-create-result.md`）。インジェクション面なし。
- `cross-boundary-invariants.md` の frontmatter 変更は reviewer 定義の静的 YAML 追記。job bootstrap 時に snapshot され、実行中 job には遡及しない設計（design.md D2 確認済み）。外部入力経路なし。
- OWASP Top 10 の適用可能項目（A03 Injection / A05 Security Misconfiguration）: 非該当。

## 検証できなかった項目

- **T-03 の "pr-create-result.md のみが dirty な round" 分離シナリオ**: tasks.md T-03 が実装するテストは `changed: [DECLARED_A, PR_CREATE_RESULT], declared: [DECLARED_A]` の mixed scenario であり、spec.md が記述する `changed: [prCreateResultPath(slug)], declared: []`（"のみが dirty"）の分離シナリオではない。この分離ケースのテストが実際に追加されるかは実装後に確認が必要。詳細は Findings 詳細参照。
- job 実行時の end-to-end 動作（実ジョブ起動による integration 検証）は spec review のスコープ外。

## Findings 詳細

### F-001: T-03 テストシナリオが spec.md シナリオと乖離（観察・非ブロッキング）

**spec.md のシナリオ（lines 9-13）:**

```
When: partitionRoundChanges({ changed: [prCreateResultPath(slug)], declared: [], slug })
Then: offending が空配列、toStage も空配列
```

**tasks.md T-03 の実装テスト:**

```typescript
// changed: [DECLARED_A, PR_CREATE_RESULT], declared: [DECLARED_A]
// toStage = [DECLARED_A]（空でない）、offending empty
```

T-03 テストは「PR_CREATE_RESULT が offending に入らない」ことは検証するが、「pr-create-result.md のみが dirty な場合に toStage も空」という spec.md の分離シナリオを直接テストしない。

**影響の評価**: T-02 の `pipelineManagedPaths` containment test と `partitionRoundChanges` のロジック（managedSet に含まれるものは toStage と offending の両方から除外）を組み合わせれば、分離シナリオが pass することは transitively 保証される。また、request.md の受け入れ基準「pr-create-result.md のみが dirty な round で offending が空」は T-03 のテストタイトル「pr-create-result.md in changed → excluded from BOTH offending AND toStage」では offending 除外を確認するが `changed` に DECLARED_A も含む。

**結論**: 実装上の正確性に問題はない。ただし spec.md のシナリオと tasks.md の実装内容が一致していないため、後で混乱のもとになる可能性がある。implementer が spec.md のシナリオ通り（`declared: []`）のテストも追加するか、あるいは spec.md のシナリオを tasks.md に合わせて修正することを推奨する（どちらも可）。ブロッキングではない。
