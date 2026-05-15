# Tasks: request-review-system-refinement

## [x] Task 1: Review prompt の書き直し

**ファイル**: `src/prompts/request-review-system.ts`

`REQUEST_REVIEW_SYSTEM_PROMPT` を全面書き直し。以下の構造に置換する:

### Review Process（4 Step）

- **Step 1: Codebase Context** — cwd の git remote・既存コードを最小限探索し、request の文脈を把握する。実装詳細の分析は行わない
- **Step 2: Request Validation** — ゴール明確性 / 受け入れ基準の検証可能性 / scope の妥当性を検証する
- **Step 3: External Dependency Check** — 外部依存（SDK / API / サードパーティ制約）の記載漏れを検出する
- **Step 4: Scope Sanity Check** — over-engineering / YAGNI / scope 肥大 / 隠れたコストを検出する

### 削除する要素

- Step 3 (Design Evaluation) 全体
- Step 4 (Trade-off Analysis) 全体
- Step 5 (Domain Synthesis) 全体
- Anti-Pattern Detection テーブル
- Design Principles セクション
- Domain Cluster output セクション
- Alternative Proposals output セクション

### 追加する要素

- **Severity Scope Constraint** セクション: severity 判定基準と scope 制約を明示
  - HIGH = request 自体の欠陥（ゴール不明、受け入れ基準不在、外部制約の検証漏れ）
  - MEDIUM = scope の曖昧さ、推奨される追記
  - LOW = 表現の改善余地
  - 対象外 = 実装設計の指摘（クラス境界、API 契約、内部実装 trade-off）→ 「design phase の責務であり、findings に含めてはならない」と明示

- **Exclusion clause**: prompt 内に「コンポーネント責任配置・API 契約・内部実装の trade-off・エラーハンドリング戦略は design agent が後続フェーズで評価する。request review ではこれらの指摘を findings に含めないこと」を記載

### Output Format の変更

- Domain Cluster セクションを削除
- Alternative Proposals セクションを削除
- Findings Summary テーブルのカラムを変更: `| # | Severity | Category | Description | Location | Recommendation |`
  - `#` は 1-indexed の stable 番号
  - `Location` は optional（file path or section reference）
  - `Recommendation` は optional（推奨アクション）
- Categories を絞る: `requirements`, `scope`, `acceptance-criteria`, `external-dependency`, `clarity`, `feasibility`（architecture / performance / security 等の実装系カテゴリを削除）

### JSON block の変更

```json
{
  "verdict": "approve|needs-discussion|reject",
  "findings": [
    {
      "number": 1,
      "severity": "HIGH|MEDIUM|LOW",
      "category": "string",
      "description": "string",
      "location": "string (optional)",
      "recommendation": "string (optional)"
    }
  ],
  "summary": "string"
}
```

- `number` フィールドを追加（1-indexed, findings 配列の順序と一致）
- `location` / `recommendation` を追加（optional）
- prompt で「summary 文中の `#N` 参照は findings の number と一致させること」を明記

### Verdict Derivation Rules

現行と同一。変更なし:
- approve: HIGH 0 件
- needs-discussion: HIGH 1+ 件
- reject: 複数 HIGH + 矛盾

### Project-Specific Design Perspective

維持する。ただし以下を追記:
- 「これらはコードベース探索時の観点であり、指摘の severity 判定は request 粒度に限定する」

### Constraints

既存の制約に追加:
- 「実装設計（クラス境界・API 契約・内部 trade-off）に関する指摘を findings に含めてはならない」

**完了条件**: prompt から design 領域の評価指示が全て削除されている。severity 判定基準に scope 制約が明示されている。

---

## [x] Task 2: RequestReviewFinding 型の拡張

**ファイル**: `src/core/request/reviewer.ts`

`RequestReviewFinding` interface に 3 フィールドを追加:

```typescript
export interface RequestReviewFinding {
  number: number;           // 1-indexed stable finding number
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  description: string;
  location?: string;        // file path or section reference
  recommendation?: string;  // 推奨アクション
}
```

**完了条件**: 型定義が更新され、`bun run typecheck` が green。

---

## [x] Task 3: parseReviewOutput のフォールバック拡張

**ファイル**: `src/core/request/reviewer.ts`

`parseReviewOutput()` 内で、parse した findings に `number` が欠けている場合のフォールバック処理を追加:

```typescript
// parse 成功後
const findings = (parsed.findings as RequestReviewFinding[]).map((f, i) => ({
  ...f,
  number: f.number ?? i + 1,
}));
```

これにより、古い prompt 形式の出力（`number` なし）でも動作する。

**完了条件**: `number` フィールドなしの JSON input に対して `number` が自動付与される。既存テストが green。

---

## [x] Task 4: formatHumanReadable 関数の実装

**ファイル**: `src/core/request/reviewer.ts`

新関数 `formatHumanReadable(result: RequestReviewResult): string` を追加:

出力フォーマット（findings あり）:
```
## Verdict: <verdict>

<summary>

## Findings

#1 [HIGH] <category> — <description>
   Location: <location>
   → <recommendation>

#2 [MEDIUM] <category> — <description>
   → <recommendation>
```

出力フォーマット（findings なし）:
```
## Verdict: <verdict>

<summary>

No findings.
```

ルール:
- `Location:` 行は `location` が truthy な場合のみ出力
- `→` 行は `recommendation` が truthy な場合のみ出力
- findings 間は空行 1 行で区切る
- findings がない場合は `No findings.` のみ

**完了条件**: 関数が export されている。

---

## [x] Task 5: executeReview の human-readable 出力を変更

**ファイル**: `src/core/command/request-review.ts`

L83-87 の出力ロジックを変更:

```typescript
// Before
if (opts.json) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  process.stdout.write(result.summary + "\n");
}

// After
if (opts.json) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  const { formatHumanReadable } = await import("../request/reviewer.js");
  process.stdout.write(formatHumanReadable(result) + "\n");
}
```

- `--json` モードは不変（既存 caller の互換維持）
- default モードで `formatHumanReadable()` を使用

**完了条件**: default 出力に verdict + summary + findings 全件が含まれる。`--json` 出力は不変。

---

## [x] Task 6: buildInitialMessage の更新

**ファイル**: `src/core/request/reviewer.ts`

`buildInitialMessage()` 内のレビュープロセス記述を新しい 4 Step に合わせる:

```typescript
// Before
レビュープロセス（現状分析 → 要件整理 → 設計評価 → トレードオフ分析 → Domain Synthesis → Devil's Advocate）を順に実行し、

// After
レビュープロセス（コードベース文脈把握 → 要件検証 → 外部依存チェック → Scope 妥当性検証）を順に実行し、
```

**完了条件**: initial message が新しいステップ名を参照している。

---

## [x] Task 7: テストの追加・更新

**ファイル**: `tests/unit/core/request/reviewer.test.ts`

### 新規テスト

- **TC-RVR-012**: `parseReviewOutput` — `number` フィールドありの JSON → number が保持される
- **TC-RVR-013**: `parseReviewOutput` — `number` フィールドなしの JSON → index+1 で自動付与
- **TC-RVR-014**: `parseReviewOutput` — `location` / `recommendation` optional フィールドの parse
- **TC-RVR-015**: `formatHumanReadable` — findings ありの場合のフォーマット検証（verdict + summary + findings）
- **TC-RVR-016**: `formatHumanReadable` — findings なしの場合 → `No findings.` 表示
- **TC-RVR-017**: `formatHumanReadable` — location / recommendation が optional で省略時にその行が出ない
- **TC-RVR-018**: `formatHumanReadable` — summary 中の `#N` が findings number と一致（content assertion）

### 既存テスト更新

- **TC-RVR-001**: `number` フィールドが自動付与されることを assertion に追加（findings[0].number === 1）
- **TC-RVR-009**: `buildInitialMessage` の内容に新しいステップ名が含まれることを確認

**完了条件**: `bun run test` が green。全テストケースが pass。

---

## [x] Task 8: typecheck & test green 確認

`bun run typecheck && bun run test` を実行し、全て green であることを確認する。

**完了条件**: exit code 0。
