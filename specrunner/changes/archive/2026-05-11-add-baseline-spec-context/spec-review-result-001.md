# Spec Review Result: add-baseline-spec-context — Iteration 1

## Verdict

- **verdict**: needs-fix
- **iteration**: 1
- **trend**: — (initial)
- **agents**: spec-reviewer (manual), architect (manual), security-reviewer (manual)
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | specs/propose-session/spec.md (MODIFIED "Propose Instruction Message Content (Updated)") | MODIFIED delta は `applyMerge` で baseline の同名 Requirement を丸ごと置換する（`reqs[idx] = block`）。現在の delta は specIndex/DynamicContext 関連の 4 Scenario のみを記述しており、baseline の openspec CLI workflow 関連 4 Scenario（"Propose instruction message content"、"openspec CLI workflow in system prompt"、"Delta spec generation is schema-driven"、"buildProposeMessage signature unchanged"）が merge 後に消失する | 方法A: MODIFIED delta に既存 Scenario を全て含めた上で新 Scenario を追加する。方法B: 既存 Requirement は MODIFIED しない（追加分は新 Requirement として ADDED セクションに記述する。例: "Requirement: Propose specIndex Injection"） |
| 2 | HIGH | completeness | specs/propose-session/spec.md (MODIFIED "Propose Session Agent Configuration") | 同上。baseline の 3 Scenario（"Agent creation for propose session"、"Agent and environment selection"、"Custom Tool included in session creation"）が merge 後に消失する。delta は baseline 参照指示の 2 Scenario のみ | 方法A: MODIFIED delta に既存の agent 設定 Scenario を含めた上で baseline 参照 Scenario を追加する。方法B: 既存 Requirement は MODIFIED せず、"Requirement: Baseline Spec Reference in System Prompt" を ADDED セクションに追加する |
| 3 | LOW | consistency | tasks.md T-07 | TC-DC-005b〜005e を `tests/git/dynamic-context.test.ts` に追加するが、TC-DC-005 は `tests/prompts/dynamic-context-prompts.test.ts` に存在する。"b" suffix は sub-case 関係を暗示するが、実際には別ファイルの無関係なテスト（buildInitialMessage のテスト）。共有 namespace 内で混乱を招く | git テスト側の新 ID を TC-DC-015〜018 に変更する（TC-DC-011〜014 が prompt テストで使用されるため） |
| 4 | LOW | consistency | tasks.md T-04 | 受け入れ基準に「既存テスト TC-DC-005/006 が pass」とあるが、これらは prompt テストで buildInitialMessage の backward compat を検証するもの。T-04 の型変更の互換性はむしろ T-07 で追加される TC-DC-013/014 で検証される | 受け入れ基準を「既存テスト TC-DC-005〜010 が全 pass（リグレッションなし）」に修正するか、T-07 のテスト ID と整合させる |

## Security Assessment

- 全操作はローカルファイルシステム内で完結。外部ネットワーク通信なし
- `collectSpecIndex` は `fs.readdir` + `fs.readFile` で `specrunner/specs/` を走査。パス構築は `path.join(cwd, specsDirRel())` + readdir 結果で path traversal リスクなし
- system prompt への追加は Read 許可のみ（Write/Edit 許可ではない）。path-fence と矛盾しない
- 認証・認可・入力検証（OWASP Top 10）に該当する攻撃面なし

## Review Detail

### Completeness (request.md ↔ design.md ↔ tasks.md ↔ delta spec)

- request.md の 6 要件が design.md の D1-D5 に対応。D1(軽量index) → 要件1,2、D2(フォールバック) → 要件1、D3(引数型) → 要件4、D4(baseline参照指示) → 要件5、D5(Purpose抽出) → 要件1
- tasks.md の 8 タスクが全要件をカバー。T-01(型) → T-02(collectSpecIndex) → T-03(統合) → T-04(引数型) → T-05(注入) → T-06(system prompt) → T-07(テスト) → T-08(検証) の依存グラフが正しい
- **問題点**: delta spec の MODIFIED セクションが baseline の既存内容を保持していない（Finding #1, #2）
- ADDED Requirement "DynamicContext は specIndex フィールドを含む" は propose-session に配置。DynamicContext は cross-cutting だが、specIndex の消費者は propose のみ（Non-Goals で明記）のため許容

### Consistency (内部整合性 + 既存 spec との整合)

- design.md の D3「`DynamicContext` 自体が optional パラメータなので後方互換性に問題なし」→ `buildInitialMessage` の第4引数は `dynamicContext?:` で optional。`propose.ts` は `deps.dynamicContext`（`DynamicContext | undefined`）を渡す。整合
- design.md D5 の Purpose 抽出ロジック（`## Purpose` の次の非空行）→ baseline spec のフォーマット `## Purpose\n\n<text>` と一致
- tasks.md T-02 の `### Requirement:` カウント → baseline spec は `### Requirement:` ヘッダーを使用。一致
- `specsDirRel()` / `baselineSpecPath()` は `src/util/paths.ts` に存在（PR #195）。一致
- T-06 の配置位置「`## CRITICAL BOUNDARY (path-fence)` の直後、`## 禁止事項` の直前」→ 実際の propose-system.ts の構造（path-fence L145-162、禁止事項 L163-169）と整合

### Feasibility

- `collectSpecIndex` は既存の `collectChangesList` と同じパターン（readdir + フォールバック）。実装リスク低
- ~1000 トークンの specIndex テーブル注入は context window に余裕あり（opus-4-6[1m]）
- 全タスクが既存パターンの拡張であり、新規アーキテクチャ導入なし
