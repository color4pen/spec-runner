# Code Review Feedback: halt-checkpoint-restack (Iteration 4)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル・diff

| ファイル | 確認内容 |
|---|---|
| `specrunner/changes/halt-checkpoint-restack/events.jsonl` | pipeline 再開経緯と iteration 3 escalation → resume → code-review 4 の遷移を確認 |
| `git log --format="%H %ci %s" -15` | commit 順序と各ステップの実行タイミングを確認 |
| `src/store/__tests__/event-journal-checkpoint-restack.test.ts` | TC-006 / detectCounterReversal の有無を確認（全体 377 行通読） |
| `src/store/journal-integrity.ts` | `detectCounterReversal` のシグネチャ・判定ロジックを確認 |
| `src/core/attach/verify-checkpoint.ts` | `detectCounterReversal` の呼び出し箇所（line 134）を確認 |
| `src/core/step/checkpoint-restack.ts` | D8 divergence check（Step 2.5 / merge-base --is-ancestor）の実装を確認 |
| `src/core/step/commit-push.ts` | `messageLabel === "checkpoint"` ガードの実装を確認 |
| `src/core/step/__tests__/checkpoint-restack.test.ts` | TC-037 (remote-diverged), TC-037-b を確認 |
| `src/core/step/__tests__/commit-push-restack-integration.test.ts` | TC-039 (finalize label guard) を確認 |
| `tests/halt-checkpoint-restack-e2e.test.ts` | TC-038 (Runner B divergence E2E) を確認 |
| `git diff c77c8ae7..HEAD --stat` | operator-apply 以降の変更スコープを確認 |
| `git status --short` | uncommitted changes の有無を確認（event-journal-checkpoint-restack.test.ts に変更なし） |

### 再開経緯の確認

events.jsonl の解析から以下の流れを確認:

1. **11:32:25** — implementer が WRITE_SCOPE_VIOLATION（specs への書き込み試行）で失敗 → awaiting-resume
2. **11:44:42** — operator-apply: design.md / spec.md / test-cases.md に D8 仕様を追加
3. **12:03:32** — implementer: D8 divergence check（Step 2.5 merge-base）と messageLabel ガードを実装
4. **12:06:41** — verification: passed（8 phases green）
5. **12:16:40** — code-review iteration 3: F-01（TC-006 missing）+ F-02（changed-lines.ts scope）で escalation
6. **12:16:41** — checkpoint: awaiting-resume
7. **12:21:49** — pipeline resume → code-review iteration 4（本 review）

**重要**: code-fixer は実行されていない。pipeline が code-fixer をスキップして code-review へ直接 resume したため、code-review iteration 4 は iteration 3 と**同一コード**を対象としている。

### Operator 裁定（iteration 3 escalation への回答）の確認

| 裁定 | 内容 | 現状 |
|---|---|---|
| [F-01] fixable として解消すること | event-journal-checkpoint-restack.test.ts に TC-006 describe を追加し detectCounterReversal が null を返すことを直接 assert | **未解消** — ファイルへの変更なし |
| [F-02] accept as-is | changed-lines.ts origin fallback は operator が承認 | **承認確認** — 対応不要 |
| 上記 2 点以外の新規変更は行わないこと | — | **確認** — uncommitted source changes なし |

### TC カバレッジ

| TC | 対応テスト | 判定 |
|---|---|---|
| TC-006 (unit/must): detectCounterReversal null assert | event-journal-checkpoint-restack.test.ts | **未実装** ✗ |
| TC-037 (unit/must): remote-diverged guard | checkpoint-restack.test.ts | ✓ |
| TC-037-b (unit): merge-base exit 0 → no divergence | checkpoint-restack.test.ts | ✓ |
| TC-038 (integration/must): Runner B divergence E2E | halt-checkpoint-restack-e2e.test.ts | ✓ |
| TC-039 (unit/must): finalize label guard | commit-push-restack-integration.test.ts | ✓ |
| TC-001〜TC-039 の残り全件 | 各テストファイル | ✓（iteration 3 と同一） |

### 受け入れ条件の確認（iteration 3 から変化なし）

| 受け入れ条件 | 対応 TC | 確認結果 |
|---|---|---|
| 作業 commit push 拒否 → awaiting-resume quiescent checkpoint が publish される | TC-001/003 E2E | ✓ |
| attach 検証が成立し、拒否 step から resume できる | TC-005 E2E | ✓ |
| 積み直し push も失敗しても throw せず warn で継続 | TC-009 E2E, TC-021 unit | ✓ |
| push 成功の通常経路は既存テスト無変更で green | TC-013 via unchanged egress-invariant test | ✓ |
| `typecheck && test` が green | verification-result.md（iter 8、passed） | ✓ |

## 検証できなかった項目

- `bun run test` の実際の実行（verification-result.md の内容を信頼）

## Findings 詳細

### F-01: TC-006 が event-journal-checkpoint-restack.test.ts に未実装（iteration 3 から継続）

Operator が iteration 3 escalation に対して「fixable として解消すること」と裁定したが、pipeline が code-fixer をスキップして code-review へ直接 resume したため、修正が適用されていない。

`event-journal-checkpoint-restack.test.ts` には TC-008 / TC-014 / TC-015 のみが実装されており、TC-006 describe（`detectCounterReversal(existingCounters, foldResult)` が null を返すことの直接 assert）は存在しない。

**機能的カバレッジ**: TC-014-e が fold() 後の historyCount / stepCounts 不変を固定し、TC-005 E2E が `runAttachVerification` → `detectCounterReversal` を通過させており、機能的正確性に問題はない。

**残存リスク**: `checkpoint-restack` record を `detectCounterReversal` が誤ってカウントした場合、最初の検出が E2E になり unit での早期発見ができない。

**必要な修正**: `event-journal-checkpoint-restack.test.ts` に以下の describe を追加する:

```typescript
import { detectCounterReversal } from "../../store/journal-integrity.js";

// TC-006: detectCounterReversal が checkpoint-restack record を counter として計上しない
describe("TC-006: detectCounterReversal returns null after checkpoint-restack append", () => {
  it("TC-006: fold result with checkpoint-restack does not trigger counter reversal", () => {
    // GIVEN stored counters reflecting one transition and one step-attempt
    const existingCounters = { historyCount: 1, stepCounts: { design: 1 } };
    // AND a fold result that includes a checkpoint-restack record
    const content =
      [
        makeStepAttemptLine("design"),
        makeTransitionLine(),
        makeCheckpointRestackLine(),
      ].join("\n") + "\n";
    const foldResult = fold(content);
    // WHEN detectCounterReversal is called
    const reversal = detectCounterReversal(existingCounters, foldResult);
    // THEN null is returned — checkpoint-restack does not reduce any counter
    expect(reversal).toBeNull();
  });
});
```

---

## Positive observations

- **D8 divergence check（Step 2.5）**: TC-037（unit）+ TC-038（E2E）が ancestor guard を二重に固定。iteration 3 時点の評価から変化なし。
- **messageLabel guard**: `if (messageLabel === "checkpoint")` による finalize 経路の除外が TC-039 で固定されている。
- **検証結果**: verification-result.md（iter 8）が typecheck + test + lint + changed-line-coverage すべて passed を記録している。
- **F-02 acceptance**: changed-lines.ts の origin fallback は operator が承認済み。自己完結・テスト付きの修正として本 PR に含まれることが確定している。
