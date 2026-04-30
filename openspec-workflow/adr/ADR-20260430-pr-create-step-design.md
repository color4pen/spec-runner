# ADR-20260430-pr-create-step-design

## Status

accepted

## Context

SpecRunner pipeline が `code-review approved → end` で終了していた。ユーザーが手動で `gh pr create` を実行する必要があった。Pipeline の全自走化（要件 → PR 作成）が self-host 完成の最終条件であった。

pr-create step を追加するにあたり、以下の設計判断が必要であった。

1. `kind: "agent"` vs `kind: "cli"` の選択
2. 既存 OPEN / MERGED / CLOSED PR 検出時の挙動
3. PR base branch の可変化 vs 固定
4. PR body の生成方法
5. 失敗時の retry 戦略

## Decisions

### D1. `kind: "cli"` を採用する

**選択**: pr-create step は `kind: "cli"` で実装する（`gh` CLI を spec-runner CLI 内で直接 spawn）。

**却下した代替案**: `kind: "agent"` — pr-create 専用 agent が gh CLI を tool で呼ぶ

**理由**:
- PR body の整形は template + state からの mechanical 抽出で十分
- verification と同じパターンで実装でき認知負荷が低い
- LLM コスト不要、retry が決定的、test が容易
- gh CLI 失敗（rate limit / auth）は LLM でも fix できないため agent 化に意味がない

### D2. 既存 PR 検出時の挙動

**選択**:
- OPEN PR → URL を state に記録して `status: "existing-open"` を返す（冪等、新規作成しない）
- MERGED PR → `status: "error", reason: "merged"` を返す（escalation 必要）
- CLOSED PR → `status: "error", reason: "closed"` を返す（escalation 必要）

**理由**:
- OPEN PR 検出の冪等性により同 branch から再 run しても安全
- MERGED / CLOSED の自動再作成は branch 命名汚染・履歴破壊リスクがあり人間判断が安全

### D3. PR base branch は `main` 固定

**選択**: 初版は `main` 固定。config 経由可変化は後続 request で対応。

**却下した代替案**: `pipeline-config.yaml` に `pr.baseBranch` を追加して可変にする

**理由**: 現状の SpecRunner workflow は main branch ベースを前提としており、可変化は YAGNI。実需が出てから対応する。

### D4. PR body は request.md ベースの独立生成

**選択**: PR body は request.md の `## 背景` / `## 目的` + pipeline 実行サマリから独立に生成する。commit messages は流用しない。

**却下した代替案**: commit messages を集約して PR body に流し込む

**理由**:
- commit messages は noisy（fix-up / chore / refactor が混在）
- request.md は人間が書いた一次情報で PR の意図を最も簡潔に表現する
- iteration ごとに commit messages の品質がぶれるが request.md は固定

### D5. resultFilePath / parseResult contract

**選択**:
- resultFilePath: `openspec/changes/<slug>/pr-create-result.md`
- parseResult: `## Status: success | failed` を regex 抽出して verdict（success / error）に map

**理由**: 他の step（verification / spec-review / code-review）も markdown を採用しており、人間可読性 + 既存 parser pattern の踏襲を優先。

### D6. 失敗時の retry 戦略: retry なし即 escalation

**選択**: retry なし、即 escalation。

**理由**:
- pipeline 全体の冪等性で再実行可能（同 branch から再 run 時に既存 OPEN PR を検出）
- gh CLI 失敗（rate limit / network / auth expired）は LLM では fix できない
- 人間に escalate した方が早い

### D7. `code-review --approved→ end` を削除して同 PR で完結

**選択**: 既存 `code-review --approved→ end` を削除し、新 transition を同 PR で追加。並行運用期間を設けない。

**理由**:
- `migration 完了判定は production 経路の grep` パターン（learned-patterns.md）に従う
- 削除と追加が 1 commit で完結するため中間状態が存在しない

### D8. request.md セクション抽出 helper の配置

**選択**: 既存 `src/parser/request-md.ts` を拡張して `sections.背景 / sections.目的` を `ParsedRequest` に追加。pr-create 専用の独立 helper は作らない。

**理由**: 同じ parser を 2 系統持つと duplication になる。parser layer の責務として自然。

## Consequences

- Pipeline が `code-review approved → pr-create → end` で完全自走化する
- `state.pullRequest = { url, number, createdAt }` が `specrunner ps` で参照可能になる
- MERGED / CLOSED PR 再利用は人間の判断を要する（escalation）
- gh CLI 認証切れは user に再認証ヒントを表示して escalate する
- PR base branch を可変にする場合は後続 request で config を追加する
