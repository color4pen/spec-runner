# Spec Review Result: migrate-project-context — Iteration 1

## Verdict

- **verdict**: approved
- **iteration**: 1
- **trend**: — (initial)
- **agents**: spec-reviewer (manual), security-reviewer (manual)
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | request.md 要件6 vs design.md D3 | request.md は `buildAdditionalInstructions() を async 化し` と記述するが、design.md D3 は `関数は同期のまま（projectContext は既に読み込み済み文字列）` と明記。design の判断は正しい（executor が事前読み込みするため adapter 側に I/O は不要）が、request-design 間の矛盾が残る | request.md 要件6 から「async 化し」を削除し「ctx.projectContext が存在する場合のみ `<project-context>` タグで追加する」に修正する。または design.md の判断を正とし implementer は design に従う旨を補足する |
| 2 | MEDIUM | completeness | tasks.md | 新規注入ロジック（executor の allowlist 判定・adapter の `<project-context>` タグ付加）に対するテストタスクが欠如。Task 8 は doctor check テストのリネームのみ。executor が allowlist 内ステップに projectContext を設定し、allowlist 外では undefined であることの検証がない | Task 8 の後に「Task 8.5: executor + adapter の projectContext 注入テスト」を追加。少なくとも (a) allowlist 内ステップで ctx.projectContext が設定される (b) allowlist 外で undefined (c) ファイル不在時に undefined の 3 ケースを検証する |
| 3 | MEDIUM | consistency | specrunner/specs/cli-commands/spec.md:166 | baseline spec が `openspec/project.md が存在すること` と記述。本変更で doctor check は `specrunner/project.md` を参照するようになるが、delta spec が提供されていない。Affected Files にも含まれていない | `specs/cli-commands/` の delta spec を追加し、doctor repo チェックの記述を `specrunner/project.md` に更新する。または tasks.md に baseline spec 更新タスクを追加する |
| 4 | LOW | consistency | specrunner/specs/repository-registration/spec.md:33-50 | bootstrap status detection が `openspec/project.md` を参照。プロジェクト規約が `specrunner/project.md` に移行した場合、bootstrap 検出ロジックも更新が必要になる可能性がある | 本変更のスコープ外（bootstrap 検出は任意リポジトリの構造検査であり、本プロジェクト固有の pipeline 注入とは別関心事）。将来的に別 request で対応 |
| 5 | LOW | correctness | tasks.md Task 4.4 | catch 句が全エラーを黙殺する。ENOENT 以外のエラー（EACCES, encoding error 等）も undefined として扱われ、デバッグ困難になる可能性がある | `catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }` として ENOENT 以外は再 throw する。または最低限 stderr に warning を出力する |

## Security Assessment

- 全操作はローカルファイルシステム内で完結。project.md の読み込みは `path.join(cwd, "specrunner/project.md")` 固定パスで path traversal リスクなし
- project.md の内容は additionalInstructions（system prompt）に挿入される。ユーザーが管理するファイルであり、信頼境界内
- `<project-context>` XML タグで境界を明示しており、prompt injection リスクは通常の system prompt 注入と同等（既存の additionalInstructions パターンと同一リスクレベル）
- 認証・認可・入力検証（OWASP Top 10）に該当する攻撃面なし

## Review Detail

### Completeness (request.md ↔ design.md ↔ tasks.md)

- request.md の 7 要件が design.md の D1-D6 に網羅的に対応。D1(読み込み責務) → 要件4、D2(allowlist) → 要件5、D3(adapter注入) → 要件6,7、D4(ファイル不在) → 要件6の一部、D5(doctor) → 要件2、D6(openspec/削除) → 要件1
- tasks.md の 9 タスクが全要件をカバー。タスク間の依存グラフ: T1(移動) → T2(paths.ts) → T3(AgentRunContext) → T4(executor) → T5(claude-code) / T6(managed-agent) → T7(doctor) → T8(テスト) → T9(検証)
- **問題点**: テストタスクが doctor check リネームのみで、core injection ロジックのテストが未定義（Finding #2）
- **問題点**: baseline spec `cli-commands/spec.md` の delta spec が欠如（Finding #3）

### Consistency (内部整合性 + 既存 spec との整合)

- design.md D3 と request.md 要件6 に async/sync の矛盾あり（Finding #1）。design の判断が正しく、実装上の影響は軽微
- design.md D2 の allowlist `["propose", "spec-review", "implementer", "code-review"]` は実在するステップ名と一致（`src/core/step/` 配下で確認済み）
- enrichContext パターンとの分離が明確。enrichContext は step 固有の動的データ、projectContext は全対象 step 共通の固定データ。`AgentRunContext` に `dynamicContext` と同じ optional パターンで追加
- TC-002 の更新が tasks.md T3.3 で明記されている
- TC-034（paths.ts は他 src/ を import しない）の堅持が tasks.md T2.2 で明記されている
- project.md 内の Directory Structure セクション更新（`openspec/` → `specrunner/`）が tasks.md T1.3 でカバーされている

### Feasibility

- 全変更が既存パターンの拡張。新規アーキテクチャ導入なし
- StepExecutor への I/O 追加は `readFile` 1 回。パフォーマンス影響なし
- adapter 側の変更は文字列連結のみ。既存の additionalInstructions / initialMessage / requestContent 構築パターンの延長
- doctor check リネームは git mv + テキスト置換。リスク低
