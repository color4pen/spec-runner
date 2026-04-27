# Spec Review Result: 2026-04-17-bootstrap-for-managed-agents — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.85 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (initial)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 7.5 | 0.10 | 0.75 |
| **Total** | | | **6.85** |

### Category Notes

| Category | Evaluation | Primary Agent |
|----------|-----------|---------------|
| completeness | bootstrap request の状態遷移が request-management の状態マシンと未接続。`RepositorySummary` 型の更新仕様が不完全 | spec-reviewer |
| consistency | `default_branch` カラムの NOT NULL DEFAULT 'main' が既存 spec と delta spec で定義されているが、実装は nullable（NOT NULL なし、DEFAULT なし）。delta spec がこの乖離を是正していない | spec-reviewer, architect |
| feasibility | 既存 `createBoundSession` + `sendMessage` の組み合わせで bootstrap 実行可能。SSE ストリームも既存基盤を活用。技術的に実現可能 | architect |
| security | IDOR 防止パターン（`getAuthenticatedUser()` 内部呼び出し）が一貫。所有権検証、GitHub API エラーマスキングも適切 | security-reviewer |
| maintainability | 状態マシンが明確に定義され、遷移ルールが文書化されている。PR URL 抽出の脆弱性への緩和策（フォールバック UI）も記載 | architect |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | specs/bootstrap-status-tracking/spec.md | bootstrap 用 request の状態遷移（`in-progress` -> `completed` on PR merge, `in-progress` -> `cancelled` on failure）が bootstrap-status-tracking spec に記載されているが、request-management spec の状態マシンとの整合性が未検証。bootstrap request は `startBootstrap` で status `in-progress` で作成されるが、request-management spec の状態遷移では `draft -> in-progress` が正規パスであり、直接 `in-progress` で INSERT することの是非が未定義。また `in-progress -> completed` は request-management spec では許可されていない（`in-progress -> reviewing -> completed`） | bootstrap-execution spec の Scenario: Bootstrap session creation で、request を `status: 'draft'` で作成してから即座に `in-progress` に遷移する、または request-management spec に `in-progress -> completed` の遷移を bootstrap request 用に許可する例外ルールを追加する。あるいは bootstrap request の状態遷移が通常の request と異なることを明示し、request-management spec に「bootstrap type の request は `in-progress` で直接作成可能、`in-progress -> completed` の直接遷移を許可」と追記する |
| 2 | HIGH | consistency | specs/database/spec.md | delta spec (database/spec.md) は `default_branch` を `TEXT NOT NULL DEFAULT 'main'` と定義しているが、実装 (`src/lib/db/schema.ts:24`) では `text('default_branch')` のみで NOT NULL もデフォルト値もない（nullable）。既存の `openspec/specs/database/spec.md` も同じく `TEXT NOT NULL DEFAULT 'main'` と記載。delta spec がこの乖離を是正しないまま、既存の誤った定義を踏襲している | delta spec の database/spec.md で `default_branch` の定義を実装に合わせて `TEXT` (nullable, no default) に修正するか、実装を spec に合わせて NOT NULL DEFAULT 'main' にするかを決定し、一方に統一する。既存 spec (`openspec/specs/database/spec.md`) にも同じ修正を MODIFIED として反映する |
| 3 | MEDIUM | completeness | specs/repository-registration/spec.md | `searchRepositories` の戻り値にリポジトリの `default_branch` が含まれていない。registration 時に GitHub API で取得する `default_branch` がどこで確定するのかが不明確。search 結果には含めず registration 時に別途取得するなら、その旨を明記すべき | repository-registration spec の Scenario: Register repository from search results に「registration 時に `GET /repos/{owner}/{repo}` で `default_branch` を取得して保存する」旨が既にあるが、search 結果の戻り値フィールド一覧に `default_branch` を含めない理由を明記する（例: search API レスポンスには含まれるが、registration 時に正確な値を個別 API で取得するため） |
| 4 | MEDIUM | completeness | specs/bootstrap-status-tracking/spec.md | `syncBootstrapPrStatus` で PR merged 検知時に bootstrap request の status を `completed` に更新すると記載されているが、この更新の実装方法（直接 DB 更新 vs `updateRequestStatus` 経由）が未指定。`updateRequestStatus` 経由なら状態遷移バリデーションに引っかかる（Finding #1 と関連）。直接更新なら状態マシンをバイパスすることになり、整合性が崩れる | `syncBootstrapPrStatus` が request status を更新する際のアプローチを明記する。推奨: bootstrap request 専用の内部ヘルパー関数を使い、通常の状態遷移バリデーションをバイパスする旨を仕様として定義する。その際、バイパスが許可される条件（bootstrap type の request のみ）を明記する |
| 5 | MEDIUM | consistency | specs/repository-binding/spec.md | delta spec の repository-binding/spec.md で `Repository List for User` の Scenario が `bootstrap_status` を含む戻り値を定義しているが、既存の `RepositorySummary` interface（`src/lib/repository-actions.ts`）への `bootstrapStatus` と `bootstrapPrUrl` フィールド追加が tasks.md の Task 3.3 にしか記載されておらず、spec レベルで型定義の変更が明示されていない | repository-binding spec の Scenario: List user repositories に「各 repository エントリは `bootstrap_status` と `bootstrap_pr_url` を含む」と明記する。または database spec で型定義（`Repository` type export）の更新を明示する（Task 1.3 に記載はあるが spec レベルの定義がない） |
| 6 | MEDIUM | consistency | tasks.md | Task 5.1 で `startBootstrap(repositoryId, agentId, environmentId)` の引数に `agentId` と `environmentId` を含むが、design.md D3 の決定では `startBootstrap(repositoryId)` のみ。Task 6.2 で Agent/Environment 選択 UI があるので引数が必要なのは正しいが、design.md と tasks.md の関数シグネチャが不一致 | design.md D3 の `startBootstrap(repositoryId)` を `startBootstrap(repositoryId, agentId, environmentId)` に更新して tasks.md と整合させる |
| 7 | LOW | maintainability | specs/bootstrap-execution/spec.md | bootstrap 指示メッセージの具体的な内容（Scenario: Bootstrap instruction message content）がかなり詳細だが、メッセージのバージョン管理や更新方針が未定義。bootstrap の指示内容が変わった場合に、どこを更新すべきかが不明確 | 指示メッセージの定義場所（コード内の定数 or 設定ファイル）と更新方針を design.md の Notes に追記する |
| 8 | LOW | completeness | specs/bootstrap-status-tracking/spec.md | `ready` → 他状態への遷移が「将来の re-bootstrap に備える」と記載されているが、`ready` 状態のリポに対して bootstrap ボタンが表示されるかどうかの UI 仕様が未定義（Scenario: Bootstrap button disabled for non-uninitialized repositories で `ready` が含まれるか曖昧） | bootstrap-execution spec の Scenario: Bootstrap button disabled で「`ready` 状態では Bootstrap ボタンは非表示（将来の re-bootstrap 機能まで）」と明記する |

## Iteration Comparison

(Initial iteration - no comparison available)

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.85 | needs-fix | Initial review. HIGH 2 件: bootstrap request 状態遷移の整合性、default_branch 定義の乖離 |

## Convergence

- **trend**: — (initial)
- **recommendation**: continue (fix HIGH findings and re-review)

## Summary

全体の設計品質は高く、状態マシン・所有権検証・ロールバック設計など Phase 2 の教訓が活かされている。セキュリティ面は IDOR 防止パターンの一貫した適用、GitHub API エラーマスキングなど適切。主な問題は 2 点: (1) bootstrap request が request-management の状態マシンをバイパスする遷移（直接 `in-progress` で作成、`in-progress -> completed` 直接遷移）が未定義、(2) `default_branch` カラムの既存 spec と実装の乖離が delta spec で是正されていない。これら HIGH 2 件を解消すれば承認閾値 7.0 に到達可能。
