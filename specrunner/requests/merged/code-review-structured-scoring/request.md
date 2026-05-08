# code-review の verdict 判定を構造化スコアリングに変更する

## Meta

- **type**: spec-change
- **slug**: code-review-structured-scoring

## 背景

現在の code-review は agent が verdict 文字列（approved / needs-fix / escalation）を自己申告する。`parseReviewVerdict()`（`src/core/parser/review-verdict.ts`）は `- **verdict**: <value>` の行を正規表現で抽出するだけで、verdict の妥当性を CLI 側で検証していない。

openspec-workflow の review-integrator は以下のロジックで verdict を構造的に決定している：
- カテゴリ別スコア（correctness / security / architecture / performance / maintainability / testing）× weight → 加重合計
- 加重合計 ≥ 7.0 かつ CRITICAL=0 かつ HIGH=0 → approved
- それ以外 → needs-fix

agent の主観的 verdict に全依存する現状は、agent が甘い評価をした場合にそのまま通過してしまうリスクがある。スコアリングを CLI 側に持つことで、品質ゲートが構造的に機能する。

## 要件

### 1. code-review system prompt の出力フォーマット拡張

1. `src/prompts/code-review-system.ts` の出力フォーマットにスコアテーブルを追加する

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

2. Findings テーブルは既存フォーマットを維持する（Severity / Category / File / Description / How to Fix）

### 2. parseResult の拡張

3. `CodeReviewStep.parseResult()` でスコアテーブルを抽出する。`ParsedStepResult` に `scores` フィールド（optional）を追加する

```typescript
interface ReviewScores {
  categories: Record<string, { score: number; weight: number }>;
  total: number;
  criticalCount: number;
  highCount: number;
}
```

4. スコアテーブルが抽出できない場合は agent の verdict をそのまま使う（後方互換）

### 3. CLI 側の verdict 判定

5. スコアが抽出できた場合、CLI が verdict を決定する:
   - total ≥ 7.0 かつ criticalCount === 0 かつ highCount === 0 → "approved"
   - それ以外 → "needs-fix"

6. agent の自己申告 verdict と CLI 判定が乖離した場合:
   - agent が approved だが CLI が needs-fix → CLI の needs-fix を採用（甘い評価の防止）
   - agent が needs-fix だが CLI が approved → agent の needs-fix を採用（厳しい方を尊重）
   - つまり常に厳しい方を採用する

### 4. Findings からの severity カウント

7. Findings テーブルから CRITICAL / HIGH の件数を数えるパーサーを追加する。`src/core/parser/review-findings.ts` に実装する

### 5. テスト

8. スコアテーブルのパースが正しく動作すること
9. Findings から severity カウントが正しく抽出されること
10. CLI verdict と agent verdict の乖離時に厳しい方が採用されること
11. スコアテーブルがない場合に既存の verdict パースにフォールバックすること

## スコープ外

- weight のカスタマイズ（config.json からの override は将来の request）
- spec-review へのスコアリング適用（spec-review は verdict 二値判定で十分）
- iteration 間のスコア比較・convergence trend 判定（別 request）

## 受け入れ基準

- [ ] code-review agent がスコアテーブルを出力する
- [ ] parseResult がスコアとseverity件数を抽出する
- [ ] CLI が加重合計 + severity で verdict を判定する
- [ ] agent verdict との乖離時に厳しい方が採用される
- [ ] スコアテーブルがない場合に既存の挙動が維持される
- [ ] `bun run typecheck && bun run test` が green
