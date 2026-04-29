# Module Architect Decisions — 2026-04-29-spec-review-pipeline

`〜する :: 理由` 形式（current-tense, ex-ante）。Step 2.5 module-architect の判断記録。

## 既存ヘルパー再利用

- `pollUntilComplete` を spec-review ポーリングの core として再利用する :: 既に timeout / sleep 注入 / 指数バックオフ / abort / `terminated` 検知が実装済みで、spec-review 用に再実装するとロジックが二重化し再開機構（Phase 2）で破綻するため
- `getFileContent` を spec-review-result.md 取得に直接使う :: 404 → null 規約が既に組み込まれており、リトライ層 (1 秒 × 3 回) を呼び出し側で薄く被せる方が境界が明確
- `appendHistory` / `updateJobState` / `failJobState` で state 更新を貫徹する :: step 内の状態書き込み規約を propose と一致させ、history journal の連続性を担保する

## 分割単位

- spec-review step を `parseSpecReviewVerdict` / `fetchSpecReviewResult` / `runSpecReviewStep` の 3 関数に内部分割する :: regex 境界値テスト・HTTP モックテスト・フロー統合テストを独立に書けるようにし、ファイル全体のテスト mock を 3 重化させない
- `runProposePipeline` の薄いラッパーを残さず `runPipeline` に完全置換する :: 内部 API なので互換要件がなく、ラッパー残置は将来の保守者の混乱と二重テスト維持コストを生む
- step 関数の配列を `runPipeline` 内 const として直接書く :: register 機構の必要性は extensibility（n=2 で見える）の問題であり、Phase 1 で導入するのは過剰設計

## State スキーマ

- `state.session` / `state.step` を `state.steps` の派生フィールドとして位置付ける :: 2 つの真実源を放置すると `specrunner ps` 表示・復元・assertion で参照先が分岐し SRP に反するため、`appendStepResult` 内で同期更新する単一経路に閉じる
- `JobState.steps` を `Record<StepName, StepResult>` として導入し、`StepName = "propose" | "spec-review"` を union で定義する :: 後続 request で `"implementer" | "code-review"` を union 拡張するだけで N-step に対応でき、refactor 対象が型定義 + register 配列の 2 箇所に閉じる

## 共通化判断の保留

- 「session 作成 + 初回メッセージ + ポーリング」共通 helper の抽出は implementer 接続時 (次 request) に判断する :: spec-review 1 サンプルだけで抽象化すると implementer / code-review の差分（Custom Tool 有無・初回メッセージ構造・timeout）を予測で組み込むことになり、premature abstraction になる

## Out-of-Scope（判断保留）

- step 配列を将来 register 機構にするかどうか :: extensibility の判断であり module-architect のスコープ外。architect / spec-reviewer のレベルで判断する
- spec-review が Custom Tool を使わない決定の妥当性 :: security boundary の判断を含むため module-architect のスコープ外
- 4 セッション直列モデル全体の境界設計 :: ドメイン判断のため module-architect のスコープ外
