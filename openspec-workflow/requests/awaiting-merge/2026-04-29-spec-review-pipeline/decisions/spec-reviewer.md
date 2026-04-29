# Spec Reviewer Decisions — 2026-04-29-spec-review-pipeline

`〜する :: 理由` 形式（current-tense, ex-ante）。Step 3 spec-review iteration 1 の spec-reviewer 判断記録。

## 評価基準の選択

- request.md の 13 要件 + 7 受け入れ基準を spec の各 capability に逐一マッピングして網羅性を評価する :: 「propose 完了 → spec-review 自動起動 → verdict 取得 → 終了挙動」の連鎖は欠落 1 つで成立しないため
- 既存 v1 状態ファイル後方互換は MUST レベルで評価する :: PR #19 で生成された state ファイルが本 request 後に読めなくなると、進行中ジョブの追跡が破綻する
- enabled フラグの伝達経路を verify する :: request.md の `enabled: [test-case-generator, adr, module-architect, security-reviewer]` が spec-review-session/spec.md の system prompt 入力に到達していないと、後続フェーズでオプションが効かない

## findings の優先順位付け

- 「既存仕様への参照漏れ・型不整合」を HIGH 以上として扱う :: 仕様の不整合は実装者を混乱させ、レビュー段階で見落とすと PR レビューでも見落とすため
- 「verdict 不在時の state.status の矛盾」を HIGH として扱う :: spec-review-session/spec.md の同一 Requirement 内で「state.status を success のまま」と「state.status を failed」が分岐しており、実装で判断不能
- design.md と spec.md の不整合を MEDIUM として扱う :: design は記録なので spec と乖離していても実装者は spec を優先するが、設計意図のトレースが困難になる

## 評価の保留 / 委譲

- security-reviewer 観点（プロンプトインジェクション・GitHub token scope）は security-reviewer 担当に委譲する :: authority 競合ルールに従い、security カテゴリは security-reviewer の最終判断とする
- feasibility 詳細評価（pollUntilComplete 再利用・runProposePipeline 削除）は architect の最終判断に委譲する :: feasibility カテゴリの authority は architect
- module-analysis.md は spec-reviewer に渡されないため、構造判断の妥当性は評価しない :: Author-Bias 方針に従う
