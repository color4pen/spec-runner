# Design: exclusion-aware-publish-prediction

## Context

`pipeline.stagingExcludePatterns` は「一致 path は guarded step で stage されない」ことを保証する repo 宣言だが、この宣言を利用すべき 3 か所の判定機構がいずれも参照していない。

### 現状の実装ギャップ（検証済み断定）

| 場所 | 問題 |
|---|---|
| `src/git/push-capability.ts:121-193` (`collectPublishablePaths`) | worktree 成分（git status）と unpushed-commit 成分（git rev-list）を単純に合算して返す。staging 除外の解決・適用なし。 |
| `src/core/step/commit-push.ts:519-533` (Layer 2 — `commitAndPush` guarded) | mixed reset 直後、`collectPublishablePaths`→`matchUnpushablePaths` で判定。除外適用（L665-666）より**前**に実行されるため、除外 path が UNPUSHABLE_PATH_BLOCKED を引き起こす。 |
| `src/core/step/commit-push.ts:1004-1023` (Layer 2 — `commitScopedPaths`) | 同様に `collectPublishablePaths` を除外なしで呼び出す。 |
| `src/core/step/commit-push.ts:568-591` (scoped residual check) | `findScopedCommitViolations(slug, postStatus.paths, filePaths, allManagedPaths)` を除外なしで呼び出す。除外 dirt → quarantine → `restoreViolatedPaths`（untracked は `git clean -f`）→ WRITE_SCOPE_VIOLATION。 |
| `src/core/runtime/local.ts:1609-1624` (Layer 1 — `validateStepOutputs`) | `collectPublishablePaths(this.spawnFn, cwd)` を除外なしで呼び出す。 |
| `src/git/push-capability.ts:228` (`renderPushCapabilityNotice`) | `matchUnpushablePaths(predictedTouchedFiles, pushCapability)` で除外フィルタなし（将来 caller が `predictedTouchedFiles` を渡した場合に誤誘導を生じる）。 |

### 設計上の根本原因

`specrunner/changes/archive/2026-08-01-guarded-staging-artifact-containment/` の導入設計は除外を guarded staging に限定し、「.gitignore が第一防衛線」としたため、除外宣言の意味論が判定側に届いていない。この変更でその乖離を全経路に閉じる。

### 既存の保護（変更しない）

`src/core/step/write-scope.ts:33-37` の `GUARDED_WRITE_STEPS`（implementer / code-fixer / adr-gen）と、guarded staging の write-scope 違反検査（L650 → exclude 適用は L665-666）は、**除外より前**に保護 canon path を検査する。この順序は維持する。

---

## Goals / Non-Goals

**Goals**:
1. `stagingExcludePatterns` 一致の worktree dirty path が Layer 1/2 unpushable-path 判定でブロックされない
2. scoped step の residual check で、除外 dirty path が violation・quarantine・restore の対象にならない
3. guarded step が生成した除外未追跡ファイルが `git clean` で削除されずに worktree に保持される
4. design / code-review / conformance / custom-reviewer が除外 scope を認識し、一致 path の commit 不在を未実装と判定しない
5. `renderPushCapabilityNotice` の predicted file 警告が除外 path を誤誘導しない（将来 caller を含む）
6. `docs/configuration.md` が新契約を正確に記述する

**Non-Goals**:
- 除外ファイルの worktree 撤去後保全（撤去で消える現行ライフサイクルのまま）
- `.github/workflows/**` push 制約そのものの解消（GitHub 仕様）
- `detectPushCapability` の検出条件変更
- glob matcher の統合
- 新しい設定面・abstraction 層の追加

---

## Decisions

### D1: `collectPublishablePaths` に worktree 除外フィルタを追加する

`collectPublishablePaths(spawnFn, cwd, worktreeExcludePatterns?: string[])` — 省略可能な第 3 引数を追加。worktree 成分（git status 由来）のみに除外を適用し、unpushed-commit 成分（git rev-list 由来）には適用しない。

**Rationale**: commit 済みの path は push で実際に publish されるため、除外で免除してはならない。mixed reset された agent self-commit は worktree 成分に戻るため、正しく除外対象として扱われる。

**実装**: `push-capability.ts` は `src/git/` 共有カーネル層（`src/util/*` のみインポート可）。`matchesGlob` は既にインポート済みであり、フィルタをインライン実装することで DSM 違反を回避できる。`staging-containment.ts` の `applyStagingExclusions` はインポートしない。

**代替案**:
- 戻り値を `{ worktreePaths, commitPaths }` に分割: call site が多く変更範囲が広がる。現行の「flat list を返す」設計を維持する方が侵襲性が低い。
- 既存関数を維持して別関数を追加: 3 call site が新旧どちらを使うか管理が複雑になる。

### D2: 3 call site で `resolveStagingExcludePatterns` を解決して渡す

**`commitAndPush` Layer 2 backstop（L524）**: `resolveStagingExcludePatterns(deps.config)` を解決して `collectPublishablePaths` の第 3 引数に渡す。`deps.config` はすでに `commitAndPush` の引数 `deps: PipelineDeps` に含まれる。

**`commitScopedPaths` Layer 2 backstop（L1014）**: 関数シグネチャに `worktreeExcludePatterns?: string[]` を 8 番目の引数として追加する。呼び出し元（`commitAndPush` scoped 分岐・`local.ts:commitRoundArtifacts`）がそれぞれ解決して渡す。

**`local.ts:commitRoundArtifacts`**: `egressParams` の型に `excludeWorktreePatterns?: string[]` を追加する。`parallel-review-round.ts` が `deps.config` から解決して `egressParams` に含める。

**`validateStepOutputs` Layer 1（local.ts L1615）**: `validateStepOutputs` インターフェースに省略可能な第 4 引数 `excludeWorktreePatterns?: string[]` を追加する（後方互換）。`step-context-builder.ts` が `deps.config` から解決して `detect` クロージャ内で渡す。`executor.ts` の call site は `unpushable-path` 契約を既にフィルタ除外しているため変更不要。

**Rationale**: 既存の `resolveStagingExcludePatterns` を唯一の解決点として再利用する（要件 9）。新しい設定面を追加しない。

### D3: scoped residual check — call site で除外 path を事前フィルタする

`findScopedCommitViolations` の呼び出し前に、`postStatus.paths` から `stagingExcludePatterns` 一致 path を除去する。`findScopedCommitViolations` 関数本体は変更しない（関数の純粋性を維持）。

除外パス列は `applyStagingExclusions(postStatus.paths, excludePatterns)` で生成し、この結果を `findScopedCommitViolations` に渡す。`allViolations` に除外 path が入らないことで、`restoreViolatedPaths` も除外 path を処理しない。

**Invariant 維持**: `findWriteScopeViolations(step.name, slug, postStatus.stagedOnly, ...)` は変更しない。除外 path は stage されないため `stagedOnly` に現れず、保護 canon 検査は自然に安全。これは guarded 分岐での順序（write-scope check → exclude）と対称である。

**代替案**: `findScopedCommitViolations` に `excludePatterns` 引数を追加する — 関数シグネチャの変更により既存テストへの影響が広がるため、call site フィルタリングを選択。

### D4: delivery exclusions block をデザイン・レビュー prompt に注入する

`staging-containment.ts` に `buildDeliveryExclusionsBlock(patterns: string[]): string` ユーティリティ関数を追加する（exclude patterns が空の場合は空文字列を返す）。

各ステップの `buildMessage` で `resolveStagingExcludePatterns(deps.config)` を解決し、非空の場合にブロックを生成して message に挿入する。注入形式:

```
## Delivery exclusions

The following paths are outside spec-runner's delivery scope and must not be required in the synthesized commits:

- .github/workflows/**
```

**対象 step**: design / code-review / conformance / custom-reviewer

**注入点**: request 制約ブロック（constraints block）の後、完了指示の前。design の場合は `buildInitialMessage` に `deliveryExclusionsBlock?: string` 引数を追加する。

**Rationale**: raw config 全体ではなく正規化ブロックを渡す（要件 4）。設定が空の場合はブロックを省略し、除外設定のない job への影響をゼロにする。

### D5: `renderPushCapabilityNotice` に worktree 除外フィルタを追加する

`renderPushCapabilityNotice(pushCapability, predictedTouchedFiles?, worktreeExcludePatterns?)` — 省略可能な第 3 引数を追加。`predictedTouchedFiles` を `matchUnpushablePaths` に渡す前に除外 path をフィルタする。

現行 caller は `predictedTouchedFiles` を渡していないため、即時の挙動変化はない。将来 caller が `predictedTouchedFiles` を渡す場合に備えた封鎖。

**Rationale**: 要件 7 の明文化。純粋関数であり外部状態を変えない。

---

### D6: pipeline 名前空間と重なる除外パターンを config load で拒否する（retrospective — PR #1096 レビュー対応、operator 適用）

PR レビューで、delivery-exclusion 契約（「一致 path は stage / commit / push されない」）が
scoped / parallel-round staging では成立しない指摘を受けた: declared step outputs と
pipeline-managed paths（state.json / events.jsonl / 結果ファイル / canon 文書 —
すべて `specrunner/changes/` 配下）は除外パターンに関係なく無条件に stage される。
これらは branch-borne state authority であり、除外を適用すると pipeline 自体が壊れるため
stage 側を変えることはできない。

代わりに、**`specrunner/changes/` 名前空間に到達し得る除外パターンを config load 時に
`CONFIG_INVALID` で拒否する**（`checkStagingExclusionNamespace` — validation.ts の
semantic check）。到達可能性は bounded glob 構文上のセグメント解析で判定する:
`**` を含むセグメントは常に到達可能、それ以外は名前空間セグメント
（"specrunner" / "changes"）との単一セグメント照合 + 内側に一致し得る残余セグメントの有無。

これにより契約は一様になる: 名前空間の外では「一致 path は絶対に stage / commit /
push されない」が無条件に成立し、名前空間との重なりは設定時点で判明する
（step 種別によって除外の意味が変わる状態を排除）。docs/configuration.md に例外を明記。

あわせて同レビューの指摘により、実 git を使う統合テスト
（`staging-exclusion-pipeline-integration.test.ts` — guarded → scoped を通しで実行し、
除外 artifact の非 commit・非 halt・worktree 保全と、非除外残余の WRITE_SCOPE_VIOLATION
非退行を検証）を追加し、docs の guarded step 列挙（build-fixer / test-materialize は
退役済み）を実装（implementer / code-fixer / adr-gen）に一致させた。

## Risks / Trade-offs

**[Risk] commit 成分の誤免除**: worktree フィルタが commit 成分に誤って適用された場合、実際に push される path がブロックされない — **軽減**: D1 の設計で worktree 成分と commit 成分を分離し、commit 成分にはフィルタを適用しないことをコードで明示する。テストで「commit 成分の除外対象は従来どおりブロック」を固定する。

**[Risk] DSM 違反**: `push-capability.ts` が `staging-containment.ts` をインポートすると shared-kernel 層のルール違反になる — **軽減**: D1 で `matchesGlob` を直接使用し、新規インポートを追加しない。

**[Risk] `validateStepOutputs` インターフェース変更による互換性破壊**: managed runtime・テスト fake が第 4 引数を受け取れない — **軽減**: 省略可能引数（optional）のため後方互換。既存実装は 3 引数のまま動作する。

**[Trade-off] design/review message サイズ微増**: 除外ブロックの追加で各 agent の初期 message が数行増加する。`stagingExcludePatterns` が空の場合はブロックを注入しないため、除外設定のない job への影響はゼロ。

---

## Open Questions

なし。要件はオーナー裁定で明確化済み。
