# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション確認（Step 2: Code Assertion Fact-Check）

以下の 13 箇所を実際のファイルで照合した。

| アサーション | 確認結果 |
|---|---|
| `resume.ts:276-332` — apply-canon gate | ✅ 実際には 278 行目から開始 (`if (resolvedWorktreePath !== null && resolvedSlug !== null)`) |
| `resume.ts:334-379` — adopt-commits gate | ✅ |
| `resume.ts:381-396` — reconcile-worktree 呼び出し | ✅ |
| `apply-canon.ts:42-89` — `detectCanonDirtyPaths` 関数 | ✅ |
| `apply-canon.ts:75-83` — XY='??' を dirty に含める | ✅ (`isUntracked = x === "?" && y === "?"` で isDirty に合流) |
| `resume.ts:326-331` — 現行 hint テキスト | ✅ |
| `write-scope.ts:64-74` — `protectedCanonPaths` | ✅ (design.md / tasks.md / spec.md / test-cases.md / request-review-attestation.json / request.md) |
| `reconcile-worktree.ts:158-261` — quarantine 機構 | ✅ (evidence-first → remove の実装) |
| `reconcile-worktree.ts:66-69` — rule 2 protected canon 除外 | ✅ (`if (protectedCanonPaths(slug).includes(path)) return false;`) |
| `design.ts:135-144` — `writes()` 宣言 | ✅ (design.md / tasks.md / spec.md を返す) |
| `design.ts:146-160` — `buildMessage` が request.md からフル再生成 | ✅ (前回部分出力を入力として読まない) |
| `event-journal.ts:90-98` — `InterruptionRecord` | ✅ (line 90 から `export interface InterruptionRecord`) |
| `commit-orchestrator.ts:344-346` — `state.step` が step 開始前に永続化 | ✅ (`store.update(state, { step: step.name })` が begin() 内で最初に実行される) |

### 設計の整合性確認

**provenance 判定の実装可能性**:
- `state.resumePoint?.step` または `state.step`（stale-running 後も `step` フィールドは保持される）で中断 step を特定できる
- pipeline registry (`src/core/pipeline/registry.ts`) に各 step の定義が登録されており、`writes()` を呼ぶためのステップ定義を取得できる
- `writes(state, deps)` に渡す `StepDeps` は `StepContext` = `{ config, slug, request }` で構成可能。これら 3 つは apply-canon gate 実行時点(resume.ts:278)には既に解決済み

**stale-running 経路**:
- stale-running 検出後の `transitionJob("awaiting-resume", ...)` で `pid: null` のみを patch する。`state.step` フィールドは変更されない
- したがって gate 到達時点でも `state.step = "design"` は保持されており、provenance 判定に使える

**"完了 StepRun 不在"**:
- `StepAttemptRecord` は step 完了時の `persist()` でのみ journal に追記される（`_writeAllToJournal` → `stepRunToRecord` → `appendEventRecord`）
- 中断された step には journal に record が無いため `state.steps?.[stepName]` は undefined または空配列になる

**--apply-canon 優先**:
- 現行コードの `if (this.options.applyCanon)` 分岐が最初に評価されるため、自動隔離は `else` 経路に置けば優先関係が自然に満たされる

## 検証できなかった項目

None（全アサーション・設計判断を実コードで確認した）

## Findings 詳細

### Finding 1: `step.writes()` 取得経路が request で未明示（low / decision-needed でなく実装ヒント不足）

**該当箇所**: request.md 要件 1「中断 step の writes() 宣言に含まれる」

要件は "writes() 宣言に含まれるか" を判定することを指定しているが、実装時に `writes()` を呼ぶための step オブジェクト取得方法が未記述。
実際には `PIPELINE_REGISTRY[state.pipelineId ?? "standard"]` から step 定義を検索 → `StepDeps` を仮構成して `writes()` を呼ぶパターンが自然な経路として存在する。
実装方針が複数ありうる（registry 参照 vs. DesignStep を直接 import）が、いずれも正しく動くため blocking でない。

### Finding 2: "完了 StepRun" の定義が未明示（low）

**該当箇所**: 要件 1「当該 step の完了 StepRun 不在」、受け入れ基準

"完了" の定義（`outcome.verdict !== null` か、`commitOid` の有無か、`state.steps[stepName]` の length か）が明記されていない。
journal に `step-attempt` が記録されている = 完了済み、と解釈するのが最もシンプルかつ正確。実装者は `(state.steps?.[stepName] ?? []).length === 0` または `state.steps?.[stepName]` の最後の run の `outcome.verdict !== null` を使う判断をする必要がある。
どちらも機能するが、前者は「そもそも一度も完走していない」ケース限定、後者は「前回の実行は成功したが今回の実行が中断」のケースも扱える点で後者がより正確。
