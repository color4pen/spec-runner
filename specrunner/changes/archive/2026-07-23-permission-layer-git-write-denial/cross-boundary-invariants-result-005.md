# Cross-Boundary Invariants Review — permission-layer-git-write-denial（Iteration 5）

## 調査対象

`git diff origin/main...HEAD --name-only`（three-dot）で確認した実際の変更範囲:

| ファイル | 変更種別 |
|---|---|
| `src/adapter/claude-code/agent-runner.ts` | 変更（Bash guard / scope enforce） |
| `src/adapter/claude-code/git-command-classifier.ts` | 新規 |
| `src/core/port/agent-runner.ts` | 変更（`AgentWriteScope` interface 追加） |
| `src/core/step/step-context-builder.ts` | 変更（writeScope 計算ブロック追加） |
| `src/util/paths.ts` | 変更（`dotSpecrunnerDirRel()` 追加） |
| `scripts/probes/write-scope-guard-probe.ts` | 変更（5 シナリオ追加） |
| テストファイル群 | 変更・新規 |

commit-push.ts / write-scope.ts / round-git-scope.ts / judge-verdict.ts / findings-ledger.ts / canon-escalation.ts / commit-orchestrator.ts は **three-dot diff でゼロ行差分**（Iteration 4 の two-dot 誤検知が解消されていることを確認）。

---

## Finding A: deny message が実際の `managedPaths` 全集合と食い違う

### 不変条件（変更されていない側）

`src/core/pipeline/round-git-scope.ts` の `pipelineManagedPaths(slug)` は 5 パスを返す:

```typescript
return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug),
        biteEvidenceResultPath(slug), prCreateResultPath(slug)];
```

`buildStepContext` は `pipelineManagedPaths(deps.slug)` をそのまま `writeScope.managedPaths` に設定する（`step-context-builder.ts:140`）。

### 新コードの挙動

`createWorkspaceToolGuard` の deny メッセージ（`agent-runner.ts:205-209`）:

```typescript
message:
  `Write to '${rel}' is denied: this is a pipeline-managed path ` +
  `(state.json / events.jsonl / usage.json / bite-evidence-result.md). ` +
  `Pipeline infrastructure writes these; agent writes are never needed.`,
```

`pr-create-result.md`（`prCreateResultPath(slug)`）が `managedPaths` に含まれるにもかかわらず、deny メッセージの列挙に出てこない。

### 影響分析

- `pr-create` step は `kind: "cli"` — agent step ではなく guard の対象外。実際にこのパスへの Write を試みる agent step は存在しない。
- 誤 deny ではなく **deny メッセージの不正確さ**のみ。安全性に影響しない。
- agent が `pr-create-result.md` を Write しようとした場合、deny は正しく発動するが、メッセージが他のパス名を列挙するため診断が困難になる。

**Severity: INFO**

---

## Finding B: guard テストの `managedPaths` フィクスチャが `prCreateResultPath` を欠く

### 不変条件（変更されていない側）

`pipelineManagedPaths(slug)` は 5 パス（`prCreateResultPath` を含む）を返し、この invariant は `round-git-scope.test.ts` の TC-001 / TC-002 で固定されている（Iteration 4 の誤検知は two-dot 比較による幻の削除であり、現行コードで 5 パスが維持されていることを確認済み）。

### 新テストの構造

`workspace-tool-guard.test.ts` の `makeScopedScope()` と `makeGuardedScope()` ヘルパーは `managedPaths` を手動列挙しており 4 パスしか含まない:

```typescript
managedPaths: [
  `specrunner/changes/${TEST_SLUG}/state.json`,
  `specrunner/changes/${TEST_SLUG}/events.jsonl`,
  `specrunner/changes/${TEST_SLUG}/usage.json`,
  `specrunner/changes/${TEST_SLUG}/bite-evidence-result.md`,
  // prCreateResultPath が欠けている
],
```

`buildStepContext` が実際に生成するスコープ（5 パス）と、guard テストが使うフィクスチャ（4 パス）の間に divergence がある。

### 影響分析

- `pr-create-result.md` を guard deny するテストケースが存在しない。
- `buildStepContext` → guard の経路でこのパスが deny されることは製造上は正しいが、テストで検証されていない。
- `pr-create` は CLI step であり、いかなる agent step もこのパスを宣言した `writes()` を持たないため、機能的な欠陥は生じない。

**Severity: INFO**

---

## Finding C: `buildStepContext` テストが `managedPaths` / `forbiddenPaths` のフィールドを検証しない

### 不変条件（変更されていない側）

`buildStepContext` の Step 7 は `managedPaths = pipelineManagedPaths(deps.slug)` と `forbiddenPaths = forbiddenWritePaths(step.name, deps.slug, declaredWritePaths)` を計算して `writeScope` に埋め込む。これが guard の正しい動作の前提条件。

### 新テストの範囲

TC-039 〜 TC-042 が検証するフィールド:

```typescript
expect(ctx.writeScope?.stagingMode).toBe("scoped");
expect(ctx.writeScope?.stepName).toBe("spec-review");
expect(ctx.writeScope?.slug).toBe(slug);
expect(ctx.writeScope?.declaredWritePaths).toEqual([resultPath]);
// managedPaths / forbiddenPaths は非検証
```

`managedPaths` と `forbiddenPaths` の配線（どの関数を使い、何を渡すか）は単体テストで固定されていない。

### 影響分析

- `managedPaths` / `forbiddenPaths` を生成する `pipelineManagedPaths` / `forbiddenWritePaths` 自体は既存のテストで固定されている。
- リスクは「`buildStepContext` が間違ったパラメータでこれらの関数を呼ぶ、あるいは別の関数に差し替えられた場合に既存テストが検出できない」という形の退行。
- 現実の実装は `deps.slug` と `declaredWritePaths` を正しく渡しており、現状では欠陥なし。

**Severity: LOW**

---

## Finding D: `git branch --contains <sha>` など filter 引数を持つ読み取り形が mutation に分類される

### 不変条件（変更されていない側）

classifier の設計方針: 「保守的字句判定でよい」「誤 deny は可用性影響であり安全側」（design.md Risks / D2）。未知 subcommand → mutation の反転 allowlist を採用。

### 新コードの挙動

`classifyConditional("branch", remainingArgs)` の判定:

```typescript
// Positional argument (branch name) → create → mutation
if (remainingArgs.some((a) => !a.startsWith("-"))) {
  return { kind: "mutation", subcommand };
}
```

`git branch --contains abc123` では `abc123` がダッシュなし → 位置引数（branch 名作成）と見なして mutation。
しかし `git branch --contains <sha>` は既存ブランチを列挙する読み取り操作。同様に `git branch --merged HEAD` も読み取りだが mutation に分類される。

### 影響分析

- deny 方向の false positive → 安全側。agent の git 状態変更を誤って許すことはない。
- agent が `git branch --contains` 形式のクエリを必要とする場合、deny message が読み取り系 git の許可を伝えるため、`git log --format='%D'` 等の代替手段に切り替えられる。
- design が明示的に認識したトレードオフクラス（「字句分類の false positive → 可用性影響」）。
- 既存の commit 層の不変条件は破れない。

**Severity: LOW**

---

## Finding E: `managedPaths` deny が `writes()` 宣言より優先される — 将来ステップへの暗黙制約

### 不変条件（変更されていない側）

guard の判定順:

1. cwd 境界 deny
2. **managedPaths deny（全 step 共通）← 新規**
3. .specrunner/ deny（全 step 共通）← 新規
4. scoped/guarded mode deny

`writes()` に宣言されたパスでも `managedPaths` に含まれれば deny される（scoped mode の allow チェックに到達しない）。

### 影響分析

現行の pipeline step 定義では `managedPaths` を `writes()` に宣言する agent step は存在しない（すべて CLI step が書く）。しかし この優先順は `AgentWriteScope` の JSDoc にも guard のコードコメントにも文書化されていない。

将来、agent step が `usage.json` のような managed path を `writes()` に宣言した場合、guard は scoped mode の allow チェックに到達せず deny する。これは現行設計の意図と一致しているが（agent が管理パスを書く正当用途はない）、意図が明文化されていないため「宣言すれば書ける」という誤解が生じうる。

**Severity: INFO**（現行ステップ定義では問題なし。将来ステップの設計制約として記録）

---

## 確認済み不変条件（全件 OK）

| 不変条件 | 確認方法 | 状態 |
|---|---|---|
| commit 層（`commit-push.ts`, `write-scope.ts`, `round-git-scope.ts`）無改変 | three-dot diff 0 行 | ✓ |
| `judge-verdict.ts` / `findings-ledger.ts` / `canon-escalation.ts` 無改変 | three-dot diff 0 行 | ✓ |
| `pipelineManagedPaths` が 5 パス（`prCreateResultPath` 含む）を返す | 現行コード読解 | ✓ |
| CLI step（pr-create / bite-evidence）は guard 非経由 | `kind: "cli"` 確認 | ✓ |
| utility query（`bypassPermissions`）は `canUseTool` 非経由 | design 確認・コード読解 | ✓ |
| managed adapter は client 側 permission surface なし | Iteration 1〜4 継続確認 | ✓ |
| allow 経路が `{ behavior:"allow", updatedInput: input }` を返す | ガードコード確認・テスト確認 | ✓ |
| Bash 分類が `writeScope` 非依存で常時適用される | `classifyGitCommand` コード確認 | ✓ |
| `buildStepContext` が scoped/guarded 両方で `writeScope` を設定する | コード確認・TC-039〜TC-042 | ✓ |
| `autoAllowBashIfSandboxed: false` が `sandbox` オブジェクトに設定される | TC-SB-02 確認 | ✓ |

---

## 総括

Iteration 4 の two-dot 誤検知（`pipelineManagedPaths` 縮小・canon-escalation 削除）は three-dot 比較により完全に幻と確認。rebase 後の実装状態では、commit 層・verdict 層・管理パス不変条件はすべて維持されている。

新規に検出した問題は INFO/LOW のみ:
- **Finding A/B**: deny message とテストフィクスチャの `managedPaths` に `prCreateResultPath` が欠ける（診断品質・テストカバレッジ上の問題）
- **Finding C**: `buildStepContext` の配線フィールド（`managedPaths`/`forbiddenPaths`）がテスト非検証
- **Finding D**: `git branch --contains` 等が保守的に mutation 分類される（設計上想定済みの false positive）
- **Finding E**: managed-paths deny の `writes()` 宣言に対する優先が未文書化

安全性・正確性に関わる HIGH/CRITICAL 所見はなし。
