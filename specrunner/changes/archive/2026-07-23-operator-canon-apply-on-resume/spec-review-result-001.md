# Spec Review Result

## 検証した項目

### 1. コードベースとの整合性確認

- `src/core/command/resume.ts` の `ResumeCommand.prepare()` 構造を精読し、T-03 が要求するリファクタ（`runStore` の外出し・apply-canon ゲート挿入位置）が既存コードに対して適切かを確認。
- `src/core/step/write-scope.ts` の `protectedCanonPaths(slug)` が spec.md に列挙された 6 パスと一致することを確認（`factCheckAttestationPath` = `request-review-attestation.json`）。
- `src/state/schema/operations.ts` の `appendSynthesizedCommit` が pure・冪等であることを確認（spec.md の要件 D4 の前提）。
- `src/util/git-exec.ts` の `runSubprocess`・`gitExec`・`SpawnFn` 定義を確認し、T-01 が記述する `detectCanonDirtyPaths` / `commitOperatorCanon` の実装が既存インターフェースと整合することを確認。
- `src/core/step/commit-orchestrator.ts`（line 363-372）の `CANON_FINDING_ESCALATION` hint 現行文字列と、T-04 が提案する新 hint 文字列を確認。
- `src/core/step/canon-escalation.ts` の `buildCanonEscalationReason` 現行出力と T-05 の変更案を確認。
- `src/core/step/commit-push.ts` の `verifyEgressLedger` / `runInlineEgressCheck` の動作（`rev-list HEAD --not --remotes=origin` で publish range を列挙し、synthesizedCommits と照合）を確認。`verifyEgressLedger` の spawnFn は `PipelineSpawnFn`（`spawn.ts`）であり、`commitOperatorCanon` が使う `SpawnFn`（`git-exec.ts`）と別型であることを確認。
- `src/cli/command-registry.ts`（line 574-637）の resume コマンド定義と `src/cli/resume.ts` の `ResumeOptions` インターフェースを確認し、T-02 が追加する `--apply-canon` フラグの挿入箇所が正しいことを確認。
- `src/core/step/commit-push.ts` の `getWorktreeChangedPaths` の NUL 区切りパース実装と T-01 の `detectCanonDirtyPaths` パース仕様を比較し、整合性を確認。

### 2. 要件シナリオのトレース

- R1（`--apply-canon` モード）の 2 シナリオを spec → design → tasks と縦断してトレース。
- R2（flag なし fail-closed）の 2 シナリオを同様にトレース。
- R3（hint 更新）の 2 シナリオをトレース。
- R4（帰属の健全性）を design D1 と照合。

### 3. テストカバレッジ確認

- TC-R1 〜 TC-R6（T-06 統合テスト）と TC-U1 〜 TC-U7（T-07 ユニットテスト）の acceptance criteria が request.md の受け入れ基準を網羅するか確認。
- spec.md 各シナリオと対応するテストケースを 1 対 1 で照合。

### 4. セキュリティ・帰属の検討

- 自動取り込み（explicit flag なし）の拒否が crash 残留エージェント編集の洗浄防止として機能することを design D1 から確認。
- `commitOperatorCanon` の explicit pathspec により非正典ファイルが operator-apply commit に混入しないことを確認。

---

## 検証できなかった項目

- `src/core/resume/` 配下の既存ファイル（`safety.ts` 等）が `src/core/step/` を既にインポートしているかどうか（循環依存チェック）。design.md は "architecture-compliant" と明記しているため、architect 評価済みとして採用。
- `git commit` 実行時の git user.name / user.email の有無がテスト環境で担保されているか（T-06 の実 git リポジトリ設定）。実装依存の細目であり spec レベルでは確認対象外。
- `runInlineEgressCheck`（`commit-push.ts`）が step 実行時に `state.synthesizedCommits` をどのように読み込むか（pipeline 内 state フロー）。pipeline executor 実装詳細に踏み込む必要があり、現スコープ外。

---

## Findings 詳細

### F1: spec.md の hint シナリオと tasks.md T-04 の提案 hint 文字列が矛盾する

**spec.md**（Scenario: hint text guides operator to --apply-canon）:

```
**And** `state.error.hint` does NOT contain `git push` or `git commit`
```

**tasks.md T-04** で提案する新 hint 文字列:

```
"保護正典への fixable finding が write-scope により解消不能です。escalation reason の finding を
手動で修正したうえで、job resume <slug> --apply-canon で operator 適用 commit として取り込んでから
再開してください。git commit / git push の手動操作は不要です。"
```

この文字列はサブストリング `"git commit"` と `"git push"` を含む。spec.md のシナリオは純粋なサブストリング存在検査として書かれているため、T-04 の hint をそのまま実装すると spec の negative assertion を満たさない。TC-R5 は positive assertion（`--apply-canon` 含む）しかテストしないため、実装段階で矛盾が表面化する。

**修正案**: hint 文の「git commit / git push の手動操作は不要です。」を「手動の git 操作は不要です。」等、当該コマンド名を明示しない表現に置き換える。あるいは spec.md の assertion を「git push / git commit を"必須手順"として案内しない」という意図ベースの検証に書き直す（前者が低コスト）。

---

### F2: `detectCanonDirtyPaths` の fail-open が R2 fail-closed 保証に例外ケースを作る

tasks.md T-01: `git status` 失敗時は `[]` を返す（fail-open）。根拠として「downstream fail-closed stop handles the gap」と記されている。

しかし R2（`--apply-canon` なし resume）において `detectCanonDirtyPaths` が `[]` を返すと、dirty canon 検出をスキップして step が開始される。step の write-scope 残余検査が operator 編集を検出した場合、quarantine + restore（= 破棄）が発生する。これは「無言破棄の廃止」（R2 の核心）と矛盾する。

git status 失敗は実運用では極稀だが、「fail-closed の保証は git status が成功した場合に限り成立する」という条件付き保証になっている点を design.md に明示することを推奨する。

---

### 観察事項（ブロックではない）

**OB-1: TC-R5 が spec.md のネガティブアサーションを未カバー**
F1 と連動。TC-R5 に `assert(hint.includes("--apply-canon"))` は書かれているが、`assert(!hint.includes("git push"))` が書かれていない。F1 解決後にテストを補完すべき。

**OB-2: `--no-worktree` + `--apply-canon` の組み合わせが spec シナリオに未記載**
design.md D6（`resolvedWorktreePath` が null の場合は警告して continue）は T-03 の acceptance criteria に記載されているが、spec.md に対応シナリオがなく、T-06/T-07 にもテストがない。低リスクの graceful degradation パスだが、カバレッジ漏れとして記録する。

**OB-3: R2 fail-closed 時に "running" 状態の残留が発生する**
T-03 の apply-canon ゲートは "transition to running" ブロック後に実行される。`--apply-canon` なしで dirty canon パスが存在すると `PrepareError(1)` が投げられるが、この時点でジョブ状態はすでに "running" に遷移・永続化されている。stale-detection が次回 resume で自動復旧するため機能的問題はないが、R2 失敗ケースでの状態遷移が design.md に明示されていない（`commitOperatorCanon` 失敗のリスクとして記述された文脈のみ）。
