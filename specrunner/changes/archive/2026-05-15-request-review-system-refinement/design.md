# Design: request-review-system-refinement

## 概要

`specrunner request review` の 2 つの構造的問題を修正する。(1) review prompt の責務を request 粒度に絞る、(2) default 出力に findings を含める。

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/prompts/request-review-system.ts` | prompt 全面書き直し — review process / severity 基準 / output format / JSON schema |
| `src/core/command/request-review.ts` | human-readable formatter の追加（verdict + summary + findings 全件） |
| `src/core/request/reviewer.ts` | `RequestReviewFinding` 型に `number` フィールド追加、`formatHumanReadable()` 関数追加 |
| `tests/unit/core/request/reviewer.test.ts` | 新 formatter / 新型のテスト追加 |

## 設計判断

### D1: Prompt 構造の再設計

現行 6 Step を 4 Step に再構成:

| 現行 | 新規 | 理由 |
|------|------|------|
| Step 1: Current State Analysis | Step 1: Codebase Context（縮小） | request 理解に必要な最小限のコードベース探索に限定 |
| Step 2: Requirements Clarification | Step 2: Request Validation | ゴール明確性・受け入れ基準・scope 妥当性の検証に特化 |
| Step 3: Design Evaluation | **削除** | design agent の責務。request review の scope 外 |
| Step 4: Trade-off Analysis | **削除** | design agent の責務。request review の scope 外 |
| Step 5: Domain Synthesis | Step 3: External Dependency Check | SDK/API 制約・外部依存の漏れ検出に特化 |
| Step 6: Devil's Advocate | Step 4: Scope Sanity Check | over-engineering / YAGNI / scope 肥大の検出に特化 |

**削除する要素:**
- Anti-Pattern Detection テーブル（God Object, Tight Coupling 等 → 実装設計の領域）
- Design Principles セクション（Modularity, Scalability 等 → design agent の責務）
- Domain Cluster output セクション
- Alternative Proposals output セクション

**追加する要素:**
- Severity Scope Constraint（実装設計の指摘は対象外であることの明示）
- Exclusion clause: 「コンポーネント責任配置・API 契約・内部実装の trade-off は design phase が担当する。これらの指摘を findings に含めてはならない」

### D2: Severity 判定基準の scope 制約

```
HIGH   = request 自体の欠陥
         - ゴール不明・矛盾
         - 受け入れ基準が不在 or 検証不能
         - 外部制約（SDK / API）の検証漏れ
         - scope 内に含まれるべき要件の欠落

MEDIUM = scope の曖昧さ、推奨追記
         - 受け入れ基準の表現が曖昧
         - scope 境界が不明瞭
         - 依存関係の記述不足

LOW    = 表現の改善余地
         - 用語の不統一
         - 読みやすさの改善

対象外 = 実装設計の指摘（以下は findings に含めない）
         - クラス / モジュール境界の設計
         - API 契約の詳細
         - エラーハンドリング戦略
         - 内部データモデルの選択
         → "design phase の責務" として prompt で明示的に除外
```

Verdict 導出ルールは現行と同一（HIGH 0 件 = approve, HIGH 1+ = needs-discussion, 複数 HIGH + 矛盾 = reject）。MEDIUM のみの場合は approve（findings は情報提供として出力）。

### D3: JSON output schema の拡張

`RequestReviewFinding` 型に `number` フィールドを追加:

```typescript
export interface RequestReviewFinding {
  number: number;           // 1-indexed stable finding number
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  description: string;
  location?: string;        // file path or section reference（optional）
  recommendation?: string;  // 推奨アクション（optional）
}
```

- `number` は prompt 側で付与を強制（reviewer が `#1`, `#2`, ... を割り当て）
- `location` / `recommendation` は optional — prompt 側で出力を推奨するが必須ではない
- `--json` 出力: フィールドが増えるだけで既存フィールドの意味・構造は不変。additive change なので後方互換

### D4: Human-readable output formatter

`formatHumanReadable(result: RequestReviewResult): string` を `reviewer.ts` に追加:

```
## Verdict: approve

The request is well-defined and ready for pipeline execution.

## Findings

#1 [MEDIUM] scope — Acceptance criteria for error handling are implicit
   Location: request.md § 要件 > エラー処理
   → Consider adding explicit error recovery acceptance criteria.

#2 [LOW] clarity — Terminology inconsistency between "session" and "run"
   → Unify terminology in the requirements section.
```

findings がない場合:
```
## Verdict: approve

The request is ready for pipeline execution.

No findings.
```

設計上の選択:
- formatter は `reviewer.ts` に配置（`request-review.ts` は thin command handler に保つ）
- markdown heading 形式（`##`）で出力 — terminal でも読みやすく、pipe 先でも parse しやすい
- finding 1 件あたり: `#N [SEVERITY] category — description` + optional `Location:` + optional `→ recommendation`

### D5: buildInitialMessage の更新

review process の Step 参照を新しい 4 Step 構成に合わせる。`Design Evaluation → Trade-off Analysis` の記述を削除し、新しいステップ名を列挙する。

### D6: parseReviewOutput の拡張

`number` / `location` / `recommendation` フィールドが JSON に存在しない場合のフォールバック:
- `number`: 配列 index + 1 で補完（`findings.map((f, i) => ({ ...f, number: f.number ?? i + 1 }))`）
- `location` / `recommendation`: undefined のまま（optional）

既存テストは `number` フィールドなしの JSON でも動作する（フォールバックで補完）。

## スコープ外の確認

- `src/core/parser/review-findings.ts`: code-review / spec-review 用の parser で、request review とは無関係。変更不要
- `src/prompts/code-review-system.ts`, `src/prompts/spec-review-system.ts`: 別 prompt。変更不要
- `src/core/step/code-review.ts`, `src/core/step/spec-review.ts`: pipeline step。変更不要
- `src/cli/command-registry.ts`: handler は `executeReview()` を呼ぶだけ。変更不要
