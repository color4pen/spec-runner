# Spec Review Result — fix-base-branch-hardcode

- **reviewer**: spec-reviewer
- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

仕様は request.md の全要件を網羅しており、実コードベースとの整合性が高い。10 箇所のハードコード参照は全て実際のソースコードの行番号・内容と一致する。データフロー（`request.md → ParsedRequest.baseBranch → 各消費者`）は明確で、既存の型・インターフェースへの拡張のみで新規型を導入しない設計判断は妥当。tasks.md のタスク分割・依存関係・検証手順も具体的で実装可能な状態にある。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | design.md:141-159 | `finish --pr=<num>` / `finish --job=<jobId>` パスでは slug が CLI 時点で不明なため `baseBranch` が `"main"` にフォールバックする。`master` ベースリポジトリでこれらのパスを使うと orchestrator 内の checkout/比較が依然として `"main"` を使う。設計は「simplicity のため」と明記しているが、bug-fix の目的に対して修正漏れが残る | (a) `FinishInput.baseBranch` を optional にし、orchestrator 内で slug 解決後に request.md をパースして baseBranch を取得する、または (b) 現状の fallback を維持しつつ、orchestrator 内に `// TODO: resolve baseBranch from request.md after slug resolution for --pr/--job paths` コメントを残す。(b) で十分 — `--pr`/`--job` は secondary path であり、slug 指定が推奨形 |
| 2 | LOW | consistency | design.md:99-102 | `WorkspaceOptions.baseBranch` は optional（`baseBranch?: string`）で、`setupWorkspace()` 内で `opts?.baseBranch ?? "main"` とフォールバックする設計。resume path で `baseBranch` が渡されない場合に暗黙の `"main"` フォールバックが残るが、tasks.md T6 で resume command にも `baseBranch: request.baseBranch` を伝搬しているため実質的な問題はない。ただし run path 以外で baseBranch が欠落した場合の safety net が `"main"` であることは留意 | ドキュメントとして設計意図通り。フォールバックの存在を tasks.md の実装ノートに追記すると明確になる |
| 3 | LOW | consistency | tasks.md:T11 | `src/core/worktree/manager.ts:65` の TODO(base-branch) 削除が T11 に含まれるが、design.md の「TODO(base-branch) マーカーの除去」セクション（line 213-222）では 5 箇所を列挙しており、うち 3 箇所は T7/T9 で削除済みと記載。残り 2 箇所（manager.ts, pr-create/runner.ts）が T11 の対象。数が合っているが、散在する記述のため実装者が見落とす可能性がある | T11 に「T7/T9 で削除済みの 3 箇所を除く残り 2 箇所」と明記するか、全 5 箇所を T11 にリストして「重複は T7/T9 で対応済み」と注記する |

## Scoring

| Category | Score | Rationale |
|----------|-------|-----------|
| completeness | 8 | 10 箇所のハードコード全てをカバー。`finish --pr/--job` パスの fallback は documented limitation |
| consistency | 9 | 既存の型構造（ParsedRequest, WorkspaceOptions, FinishInput）への拡張のみで一貫性が高い。request.md 自身にも `base-branch` フィールドが追加済み |
| feasibility | 9 | 全変更箇所の行番号が実コードと一致。テスト fixture 更新の箇所も具体的に列挙されており実装工数の見積もりが容易 |

## Verdict Rationale

CRITICAL: 0, HIGH: 0。Finding #1 は MEDIUM だが、primary path（`finish <slug>`）は正しく修正される設計であり、secondary path の limitation は明示的に文書化されている。仕様は実装可能な状態にある。
