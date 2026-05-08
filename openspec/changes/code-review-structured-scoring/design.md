## Context

`parseReviewVerdict()` は `- **verdict**: <value>` の正規表現マッチだけを行い、verdict の妥当性を検証しない。agent が「スコア 5.0 だが approved」と書いても CLI はそのまま通す。

openspec-workflow の review-standards.md（`.claude/rules/review-standards.md`）は以下の判定ルールを定義している:

- カテゴリ別スコア × weight → 加重合計（Total）
- Total >= 7.0 かつ CRITICAL=0 かつ HIGH=0 → approved
- それ以外 → needs-fix

これを CLI 側に移植し、agent の自己申告に依存しない構造的な verdict 判定を実現する。

## Goals / Non-Goals

**Goals:**

- code-review agent がカテゴリ別スコアテーブルを出力するようプロンプトを拡張
- スコアテーブルと Findings の severity を CLI 側でパースする
- CLI が構造的に verdict を判定し、agent の自己申告より厳しい方を採用する
- スコアテーブルが出力されない場合に既存の verdict パースにフォールバックする（後方互換）

**Non-Goals:**

- weight のカスタマイズ（config.json からの override）
- spec-review へのスコアリング適用
- iteration 間のスコア比較・convergence trend 判定
- escalation verdict の CLI 判定（escalation は agent の判断を尊重）

## Decisions

### D1: スコアテーブルのパーサーを独立モジュールに配置

`src/core/parser/review-scores.ts` にスコアテーブルパーサーを、`src/core/parser/review-findings.ts` に Findings severity カウンターを配置する。

```ts
// review-scores.ts
export interface ReviewScores {
  categories: Record<string, { score: number; weight: number }>;
  total: number;
}
export function parseReviewScores(content: string): ReviewScores | null;

// review-findings.ts
export interface FindingSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}
export function parseFindingSeverityCounts(content: string): FindingSeverityCounts;
```

**理由**: `review-verdict.ts` は verdict 行の正規表現抽出に特化しており、テーブルパースの責務を持たせると SRP 違反になる。parser ディレクトリ配下に 3 つの独立モジュール（verdict / scores / findings）を並べることで、テスタビリティと責務分離が維持される。

**代替案**: `review-verdict.ts` を拡張してスコアパースも統合する方法。しかし既存のテスト構造が壊れ、パーサーの責務が「verdict 行の抽出」から「レビュー結果全体の構造化パース」に肥大化するため不採用。

### D2: ParsedStepResult への scores 追加は optional フィールド

```ts
export interface ParsedStepResult {
  verdict: Verdict | null;
  findingsPath: string | null;
  fileContent?: string | null;
  scores?: ReviewScores & { criticalCount: number; highCount: number };
}
```

`scores` フィールドは code-review step のみが使用する。他の step（spec-review, verification 等）は `scores` を設定しない。optional にすることで既存の step 実装への影響をゼロにする。

**理由**: `ParsedStepResult` は全 step が共有する union ではなく共通 interface であるため、optional フィールドの追加が最も低コスト。step ごとに異なる Result type を持たせる方法は、executor の型分岐が必要になり overengineering。

### D3: CLI verdict 判定ロジック — 厳しい方を採用

```ts
function determineVerdict(
  agentVerdict: Verdict | null,
  scores: ReviewScores | null,
  severityCounts: FindingSeverityCounts
): Verdict {
  if (agentVerdict === "escalation") return "escalation";

  if (!scores) return agentVerdict ?? "escalation";

  const cliVerdict: Verdict =
    scores.total >= 7.0 && severityCounts.critical === 0 && severityCounts.high === 0
      ? "approved"
      : "needs-fix";

  // 厳しい方を採用: needs-fix > approved
  if (agentVerdict === "needs-fix" || cliVerdict === "needs-fix") {
    return "needs-fix";
  }
  return "approved";
}
```

判定ルール:
1. agent が escalation → escalation をそのまま採用（CLI はエスカレーション判断を上書きしない）
2. スコアがない → 既存の agent verdict にフォールバック
3. スコアがある → CLI verdict と agent verdict の厳しい方（needs-fix が優先）

**理由**: agent が approved だが CLI 判定が needs-fix のケース（甘い評価）を防止する。逆に agent が needs-fix だが CLI が approved のケース（agent が追加の文脈から問題を検出）も agent の判断を尊重する。「厳しい方を採用」は openspec-workflow の review-integrator と同じ方針。

### D4: system prompt の Scores テーブル出力フォーマット

既存の Output Format セクションに Scores テーブルを追加する:

```markdown
## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 7.8
```

weight は prompt 内にハードコードする（review-standards.md の default weight と一致）。パーサーはテーブルから weight を読み取るため、将来 weight をカスタマイズしても prompt 側の変更だけで済む。

**理由**: Findings テーブルと同じ markdown テーブル形式で統一し、パーサーの実装を単純化する。total 行はテーブル外に置くことで、加重合計の検算（パーサー側で再計算して照合）が可能になる。

### D5: パーサーのロバストネス — total の検算はしない

パーサーは agent が出力した total をそのまま採用する。CLI 側で weight × score の再計算はしない。

**理由**: agent が正しいスコアを出力している前提で、CLI はスコアの「構造」（テーブルの存在とパース可能性）を検証する。再計算して不一致時にどちらを採用するかのロジックは複雑になり、初期実装の scope を超える。将来の request で「CLI 側で total を再計算し、agent の total と乖離があれば警告する」機能を追加できる。

## Risks / Trade-offs

- **[Agent 出力のばらつき]** agent がスコアテーブルを出力しない、またはフォーマットが微妙に異なる場合がある → 緩和策: パースに失敗した場合は既存の verdict パースにフォールバック（後方互換）。prompt に具体的なフォーマット例を含めることで出力安定性を高める
- **[weight ハードコード]** prompt 内の weight と review-standards.md の weight が乖離するリスク → 緩和策: 現時点では review-standards.md の default weight を prompt に転記するだけなので乖離しない。将来の config.json override で一元管理する
- **[ParsedStepResult の肥大化]** optional フィールドが増え続けるリスク → 緩和策: scores は code-review 固有であり、他の step が同種のフィールドを追加するなら step-specific result type への分割を検討する（現時点では 1 つの追加で済むため premature）
