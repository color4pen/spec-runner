# Spec Review Result: create-polish-and-resume — Iteration 1

## Verdict

- **verdict**: approved
- **score**: 7.90 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 3
- **trend**: —
- **agents**: spec-reviewer, security-reviewer
- **retries**: 0/3
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 9 | 0.15 | 1.35 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **7.90** |

### Score Rationale

- **completeness (8)**: request.md の全 6 カテゴリ（resume / slug 対話 / cleanup / Ctrl+C / --run / テスト）を proposal → design → tasks → delta spec で網羅。`--resume` + `--slug` 併用時の挙動が未定義だが、実用上の影響は限定的。
- **consistency (7)**: design D1 の cold start stderr メッセージが tasks 2.2 の記述と不整合（後述 #1）。delta spec の MODIFIED requirement title が R2 の既存 title と不一致（後述 #3）。
- **feasibility (8)**: 既存コードベースの構造（DraftState / saveDraft / slugify / queryInteractive）を正確に参照しており実装可能。SIGINT async handler のリスクは R3 で認識済み。
- **security (9)**: 本変更にセキュリティ面の懸念なし。入力はユーザーの対話入力と LLM 応答のみ。slug バリデーション（kebab-case / 50文字 / 衝突チェック）も維持。
- **maintainability (8)**: task 分割が明確で依存順序も適切。`runRunCore` の core→cli import は既存パターンの踏襲で新規退行ではない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | design.md:52-59 | cold start の stderr メッセージ `"セッションを復旧できなかったため新規開始します"` が `!query` ブロック内で無条件に表示される。sessionId が元々ない場合（hot resume 未試行）にも表示され、request 要件 3（フォールバック時のみ通知）および tasks 2.2 と不整合 | `process.stderr.write` を try-catch の catch ブロック内に移動し、sessionId 不在時の cold start では別のメッセージ（例: 無表示）とする。design のコード例を修正 |
| 2 | MEDIUM | feasibility | design.md:138-146 | SIGINT handler 内で async の `saveDraft()` を呼ぶが、Node.js は signal handler 内の async 完了を保証しない。Risk R3 で認識済みだが緩和策が未提示 | design の R3 に「`fs.writeFileSync` による同期書き込みへの fallback を検討する」旨を追記するか、`saveDraft` に sync variant を用意する方針を明記する |
| 3 | LOW | consistency | specs/cli-commands/spec.md:5 | MODIFIED の requirement title `"specrunner create の引数パース"` が R2 delta の既存 requirement title（`"specrunner バイナリは 7 つのサブコマンドを提供する"` 内の create 定義）と不一致。openspec の requirement 追跡で紐付けが切れる | R2 と同じ requirement title を使うか、create サブコマンド固有の requirement として新設する場合は ADDED に変更する |
| 4 | LOW | completeness | specs/cli-commands/spec.md | `--resume` と `--slug` の併用時の挙動が未定義。tasks 1.4 は「slug は draft の DraftState から復元する」とあるが、`--slug` が同時に渡された場合の優先順位・エラー扱いが不明 | scenario を追加: `--resume` 指定時は draft の slug を使用し、`--slug` は無視する（または conflicting flags としてエラー） |
| 5 | LOW | architecture | tasks.md:66 | task 6.3 で `runRunCore` を `src/cli/run.ts` → `src/core/command/create-dialog.ts` に import。core→cli の層違反。`create.ts:15` に既存の同パターンがあるため新規退行ではないが、debt が拡大する | 現時点では許容。将来の cleanup で `runRunCore` を core 層に移動する際にまとめて対処 |

## Summary

proposal / design / tasks / delta spec の 4 アーティファクトが request.md の全要件を整合的にカバーしている。既存コードベース（DraftState / saveDraft / slugify / queryInteractive / FINAL_DRAFT マーカー）の参照も正確で、実装の実現可能性に問題はない。

MEDIUM 2 件はいずれも実装フェーズで自然に解消可能な粒度であり、マージ阻止には至らない。design D1 の cold start メッセージ条件分岐は implementer が tasks 2.2 に従えば正しく実装される見込み。SIGINT async リスクは実用上問題ないが、design に緩和策を明記しておくとレビュー時の再指摘を防げる。
