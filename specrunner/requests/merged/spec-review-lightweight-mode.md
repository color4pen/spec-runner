# spec-review の lightweight モードを強化する

## Meta

- **type**: spec-change
- **slug**: spec-review-lightweight-mode

## 背景

`src/config/type-config.ts` に `specReviewMode: "full" | "lightweight"` が定義されており、refactoring と chore は lightweight に設定されている。`spec-review.ts:88` で `getSpecReviewMode()` を呼び出し、`buildSpecReviewModeInstruction()` で初期メッセージに注入する仕組みは既に実装済み。

しかし現状の lightweight instruction は以下の 1 行のみ（`src/prompts/spec-review-system.ts:117`）:

```
Review scope: Architecture and specification review only. Security review is not required for this request type.
```

これはセキュリティレビューの省略を指示するだけで、refactoring / chore に不要な観点（completeness: 要件網羅性、consistency: 既存 spec 整合性、feasibility: 工数見積）の省略は指示していない。結果として lightweight でも full とほぼ同じ検証が走り、不要な findings が出る。

## 要件

### 1. lightweight instruction の拡充

1. `src/prompts/spec-review-system.ts` の `buildSpecReviewModeInstruction()` を拡充する。lightweight 時に以下を明示する:
   - 「振る舞い不変の変更である」前提を agent に伝える
   - 検証する観点: architecture（設計パターン、責務分離、依存方向）、correctness（ロジック、境界条件）
   - 簡略化する観点: completeness は「タスク分割の網羅性」のみ確認（要件の網羅性は振る舞い不変なので不要）、consistency は「既存 spec との照合」を省略（spec 変更がないため）
   - 省略する観点: feasibility（工数見積は refactoring / chore では不要）、security（既存の指示通り）

### 2. maxTurns の調整

2. `spec-review.ts` の `buildMessage()` 内で specReviewMode が lightweight の場合に `maxTurns` を制限する方法を検討する。現在の step-config resolution chain（`step-config.ts`）は request type に応じた動的 override をサポートしていない

3. 最もシンプルな実現方法: SpecReviewStep の定義で `maxTurns` を固定値（15）にするのではなく、`buildMessage` と同じ入力（state.request.type）を参照して動的に返す仕組みを追加する。具体的には `AgentStep` に optional な `getMaxTurns(state, deps): number | undefined` を追加し、StepExecutor が `step.maxTurns` の前にこれを参照する

4. lightweight 時の maxTurns は 10 とする（full は 15 のまま）

### 3. テスト

5. refactoring / chore type で拡充された lightweight instruction が初期メッセージに含まれること
6. new-feature / spec-change / bug-fix type で full instruction が使われること
7. lightweight 時の maxTurns が 10 であること（getMaxTurns が使われる場合）

## スコープ外

- code-review の lightweight モード（code-review は全 type で full review が必要）
- spec-review ループ回数の type 別調整
- spec-fixer prompt の変更（入力の findings が変われば出力も変わる）
- step-config resolution chain への type-level 追加（動的 maxTurns はまず getMaxTurns で最小限に実現する）

## 受け入れ基準

- [ ] lightweight 時の instruction が観点ごとの検証/簡略化/省略を明示している
- [ ] refactoring / chore で lightweight、その他で full が使われる（既存の挙動を維持）
- [ ] lightweight 時の maxTurns が full 時より小さい
- [ ] `bun run typecheck && bun run test` が green
