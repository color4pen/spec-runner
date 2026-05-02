# test-case-generator 判断記録 — cli-finish-command

## 判断一覧

6 正規化状態をそれぞれ独立した must テストケースとして分割する :: 設計 Decision 7 が「テストもこの 6 状態を網羅するだけで済む」と明示しており、1 テストケースに複数状態を詰め込むと失敗箇所の特定が困難になるため

TC-011 を TC-010（BLOCKED → OPEN_CHECKS_FAILING）と分離する :: `mergeStateStatus=CLEAN` + `statusCheckRollup=FAILURE` の組み合わせは BLOCKED とは独立した code path（tasks.md §3.3）であり、設計上「CLEAN でも checks failing なら倒す」ルールの固有検証が必要なため

escalation snapshot テスト（TC-023）は 4 escalation トリガーをまとめて 1 ケースとする :: 4 パターンは同一の `formatEscalation` 関数を経由しており、「4 フィールドが揃うか」という共通不変条件の検証が目的。個別 stdout 内容は TC-019〜TC-022 でカバーされているため重複を避ける

archive の 3 分岐（TC-024/TC-025/TC-026）は全て must にする :: request.md 受け入れ基準が「openspec/changes/<slug>/ の有無 / delta spec の有無で archive 動作が 3 通りに分岐する」を明示列挙しているため、should への格下げは受け入れ基準違反となる

冪等性テスト（TC-028/TC-046/TC-047）を must にする :: request.md §9 と受け入れ基準が「冪等性」と「部分実行からの resume」を明示的な受け入れ条件として挙げており、これが壊れると finish の本質（deterministic 再実行可能性）が成立しないため

TC-054（exhaustive-switch 型エラー検出）を manual/must にする :: TypeScript の型システムが失敗検出メカニズムとして機能するが、これは CI 実行であり「テストコードで自動検証する」ものではなく「ビルド成果物 / typecheck で確認する」カテゴリに該当するため

TC-051 と TC-065（LLM 呼び出し不在 / 直 push 不在の grep 検査）を manual/must にする :: 実行時の動的テストでは検出できず、ソース grep という静的解析手順が必要。また request.md が「LLM 呼び出しは一切発生しない」を受け入れ基準として明記しているため

--force フラグの挙動を OPEN_CHECKS_FAILING（TC-016）と OPEN_BEHIND/OPEN_CONFLICTS（TC-059）の 2 ケースに分割する :: request.md §3 状態検知テーブルが「--force 時の挙動」列で OPEN_BEHIND/OPEN_CONFLICTS は escalation 継続と明記しており、「--force を付けても効かない」ことは「付けて効く」ことと同等の重要性があるため

TC-033（status=success の後方互換読み込み）を must にする :: design.md §5 Migration Plan が「既存 status=success の job state は現状のまま読める」を Phase 3 の前提として明記。これが壊れると既存ユーザーが ps でクラッシュするため

TC-036（auto-merge fallback）を must にする :: design.md §1 と Risks §2 が fallback を設計上の必須分岐として文書化しており、`gh pr merge --auto` 非対応リポジトリでの動作継続に直結するため

TC-045（全ステップ integration テスト）を must にする :: request.md の最重要受け入れ基準「specrunner finish <jobId> で OPEN_MERGEABLE な PR を最後まで処理しきれる」をステップ間の結合で検証する唯一のテストケースであり、unit テストが全て PASS しても組み合わせが壊れる可能性を排除できないため

TC-052（dogfooding-006 E2E）を should にとどめる :: request.md が「本 change 自体の merge 後に実行」と明記しており、self-bootstrap 不可の制約から本 change の CI では実行不可能。could ではなく should にする理由は「機能の実環境検証として行うべき」であり、省略は推奨されないため
