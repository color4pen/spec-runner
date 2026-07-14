# Cross-Boundary Invariants Review — postwork-format-check-as-detector

- **reviewer**: cross-boundary-invariants
- **verdict**: needs-fix
- **iteration**: 001

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装単体は正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## Findings

### F-01 [HIGH / needs-fix] — managed design step（SSE path）に `outputVerification` ループがなく、`policy: "follow-up"` が事実上 `policy: "halt"` に縮退する

#### 事実関係

| 項目 | 実測 |
|------|------|
| 変更前の設計 step | `outputContracts` なし → `outputVerification` を設定しない → 問題なし |
| 変更後の設計 step | `outputContracts` が `policy: "follow-up"` の `content-format` 契約を返す |
| managed runner の dispatch | `useSseStrategy(step) === (step.agent.role === "design") === true` → `runDesignStyle` |
| `runDesignStyle` の `outputVerification` 処理 | **存在しない**（`src/adapter/managed-agent/agent-runner.ts` L220–279） |
| `runPollingStyle` の `outputVerification` 処理 | L504–530 に実装あり、code-review / implementer 等で動作 |
| local runner の `outputVerification` 処理 | 全 step に対して L805–830 付近で動作（SSE/polling 区別なし） |

#### 不変条件の破れ方

```
暗黙の前提（変更前から成立）:
  "policy: 'follow-up' の OutputContract は runner の outputVerification ループが
   in-session repair を最大 OUTPUT_FOLLOWUP_MAX_ATTEMPTS 回試み、
   それでも残った violation のみ executor gate で halt する"

この変更で:
  design step に content-format/follow-up 契約を追加した
  → local mode では上記前提が成立する（local runner に outputVerification あり）
  → managed mode では成立しない（runDesignStyle に outputVerification なし）
  → managed mode の design step で spec.md 形式違反 → 修復ターンゼロで即 halt
```

#### 具体的な挙動の差異

| runtime | spec.md 形式が正しい | spec.md 形式違反（pathological case） |
|---------|----------------------|---------------------------------------|
| local | violation 0 件 → pass ✓ | repair ターン最大 2 回 → 残れば halt |
| managed | violation 0 件 → pass ✓ | 修復ターンゼロ → executor gate で即 halt |

- **通常ケース（valid spec.md）** は managed/local ともに同一 → 実際の影響はレア
- **病的ケース** で managed は repair opportunity なし → local より先に escalation
- `policy: "follow-up"` が managed mode で `policy: "halt"` 相当に黙って縮退する

#### 安全性

「spec.md 形式違反 → escalation」の最終安全ネットは managed mode でも executor gate が担保する。
サイレントな腐敗（不正形式の spec.md がそのまま下流へ流れる）は起きない。
ただし、repair 機会なしに即 escalation するため、設計が約束した「follow-up セマンティクス」を満たさない。

#### 修正方針

`runDesignStyle` にも `outputVerification` ループを追加する（`runPollingStyle` の L504–530 と同じ構造）。
SSE 終了後、`postWorkPrompts` ループの直後に配置できる:

```typescript
// 追加箇所: runDesignStyle の postWorkPrompts ループの直後
const outputVerif = ctx.policy?.outputVerification;
if (outputVerif) {
  for (let attempt = 1; attempt <= outputVerif.maxAttempts; attempt++) {
    // ... runPollingStyle と同じロジック
  }
}
```

`outputVerif.detect()` は managed runtime の `validateStepOutputs`（`getRawFile` で branch 上の spec.md を読む）を呼ぶ。
設計エージェントは SSE 終了前に push 済みのため、タイミング依存は既存 produced / tasks-complete と同一。

---

### F-02 [LOW / advisory] — repair prompt の "commit and push" 指示は local mode の design step で不要

#### 事実関係

`buildOutputFollowUpPrompt`（`src/core/step/output-verify.ts` L186）は content-format violation に対して
「Fix the format issues … Do not use tool calls to submit results.」に続き、
関数末尾（L187）で**全違反種別に共通の** "After completing the work, commit and push your changes." を追加する。

| step | local mode での commit 責任 | 影響 |
|------|-----------------------------|------|
| design | CLI が `finalizeStepArtifacts` で commit | "commit and push" 指示が redundant |
| implementer | agent 自身が commit/push（tasks-complete の設計前提） | 正しい |
| code-review | agent 自身が commit/push（`capabilities: { gitWrite: true }`） | 正しい |

`LocalRuntime.validateStepOutputs` は worktree の local FS から読むため、
**design の repair ターンで agent がファイルを書くだけで（commit なしで）再検証が通る**。
その後 `finalizeStepArtifacts` が正常に commit する。

#### 安全性

agent が repair ターンで git commit まで実行した場合、`finalizeStepArtifacts` が "nothing to commit" を
処理できる限り no-op になり、機能的なブレークは生じない。

ただし prompt の ambiguity（F-01 の code review Finding #1 とも重複）は残る。
`content-format` セクション専用に "Do not commit. Fix the file and end your turn; the CLI will commit." 等を
付与すると intent がより明確になる。

---

## 判断根拠

- **F-01** は「変更前から成立していた不変条件（follow-up seam の修復セマンティクス）を、
  変更後のコードが managed SSE path で黙って破る」典型的な cross-boundary invariant 違反。
  code review（F-01 は未検出）でも spec-review でも捕捉されていない。
  local mode のテストのみが green なのは、local runner には `outputVerification` が常にあるため。
- **F-02** は functional break ではなく prompt ambiguity。既存 code review Finding #1 と同一観点。
  needs-fix には分類しない（advisory 扱い）。

F-01 の修正は `runDesignStyle` への `outputVerification` ループ追加のみで完結し、
他 step・他 path への影響はない（blast radius 小）。
