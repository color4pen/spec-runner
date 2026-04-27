## Code Review Result

**Verdict**: approved
**Score**: 8.10 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (初回)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.10** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS |
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (198/198, 420 expect() calls) |
| Security | PASS (1 pre-existing moderate advisory: postcss XSS — transitive dep, not introduced by this change) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/lib/repository-registration-actions.ts:148 | JSDoc コメントが `inserts into repositories with bootstrap_status: 'uninitialized'` のままだが、実際の挙動は動的検出に変更されている。コメントとコードの乖離 | JSDoc を `Detects bootstrap status via GitHub API and inserts with the detected status.` のように更新する |
| 2 | LOW | maintainability | src/lib/repository-registration-actions.ts:55 | `getDirectoryContents` のパス引数 `'requests/active/'` に末尾スラッシュがある。GitHub API は許容するが、同ファイル内の `getFileContent` 呼び出し（末尾スラッシュなし）と不統一 | `'requests/active'` に変更して統一する（任意） |
| 3 | LOW | testing | src/__tests__/bootstrap-detection-on-register.test.ts | TC-012 (should: defaultBranch パラメータ転送の検証) が独立テストとして未実装。TC-007 の URL キャプチャで間接的にカバーされているが、異なる branch 名（e.g. `'develop'`）での明示テストがない | TC-012 として `defaultBranch: 'develop'` を指定した fetch mock テストを追加する（should priority のため任意） |

### Code-Reviewer Analysis

**correctness (9/10)**: `detectBootstrapStatus` のロジックは仕様通り。`projectFile !== null && activeDir.length > 0` の AND 条件が design.md Decision 1 に合致。`getFileContent` は 404 で null、`getDirectoryContents` は 404 で空配列を返す既存設計を正しく活用している。try-catch による安全側倒しも design.md Decision 4 に準拠。edge case (両方 404、片方のみ 404、ネットワークエラー、500 エラー) が全てテストでカバーされている。

**security (8/10)**: `registerRepository` は `getAuthenticatedUser()` で認証チェック済み。`detectBootstrapStatus` に渡すトークンは認証済みユーザーの `accessToken` であり、外部入力を直接渡していない。GitHub API エラー時に内部情報を漏洩するパスはない（catch ブロックは `'uninitialized'` を返すのみ）。security-reviewer はパイプライン設定で skip されているため、このスコアは code-reviewer の supplementary 評価。

**architecture (8/10)**: `detectBootstrapStatus` をモジュールプライベート関数として配置する判断は適切（design.md Decision 5）。既存の `github-api.ts` の関数を再利用し、新しい API ラッパーを作らない方針も妥当（Decision 2）。`'use server'` ファイル内での配置は constraints.md の「モジュール境界」ルールに適合。

**performance (8/10)**: `Promise.all` による並列実行で登録レイテンシへの影響を最小化（Decision 3）。GitHub Contents API は通常 100ms 以下。追加の API 呼び出しは 2 回のみで、登録は低頻度操作のためレートリミットへの影響も軽微。

**maintainability (7/10)**: コードは簡潔で読みやすい。JSDoc の不整合（F-1）が減点要因。命名は明確で、`detectBootstrapStatus` は関数の意図を正確に表現している。

**testing (7/10)**: test-cases.md の must 9 件中 9 件が全て実装済み。TC-010 は TC-005/TC-006 でカバー、TC-011 は全 198 テスト PASS で確認。TC-012 (should) は間接カバーだが独立テストなし。TC-013 は manual のため対象外。静的解析テストは constraints.md の「指示系チェックに限定」ルールに準拠。`globalThis.fetch` モック戦略は他テストとの干渉を回避する pragmatic な選択。

### Pattern-Reviewer Analysis (review-lessons.md 準拠)

- **認証/認可**: `registerRepository` は冒頭で `getAuthenticatedUser()` を呼んでおり、問題なし
- **状態マシン**: `bootstrap_status` の値は `'ready'` または `'uninitialized'` のみで、既存の状態マシン遷移ルールを破壊しない（Non-Goals に「状態マシン遷移ルール自体の変更なし」と明記）
- **URL/パスエンコーディング**: `getDirectoryContents` は内部で `encodeURIComponent(ref)` をクエリパラメータにのみ適用。パス部分はエンコードなし。constraints.md の「パス全体に encodeURIComponent を適用しない」ルールに準拠
- **テスト**: 静的解析テスト（`toContain`）は import 文・`Promise.all`・`try-catch` の指示系チェックに限定されており、ビジネスロジックはモックを使った振る舞いテストで検証。constraints.md に準拠
- **同一モジュール import**: `getFileContent` と `getDirectoryContents` は `'./github-api'` からの静的 import。動的 import との混在なし

### Summary

- 実装は design.md の全 5 Decisions に忠実で、仕様準拠性が高い
- 唯一の must-fix は JSDoc コメントの更新（F-1: MEDIUM）。実装は正しいがドキュメントが古い
- テストカバレッジは must 9/9 達成。エラーハンドリングの安全側倒しが適切にテストされている
- 全 198 テスト PASS、ビルド・型チェック・lint も問題なし
