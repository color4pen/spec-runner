# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: needs-fix

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✗ | T-08 に unchecked item が 1 件残存（fileContent 除去） |
| design.md | ✓ | D1〜D9 すべて実装済み |
| spec.md | △ | 「導出可能フィールドと fileContent を state から除く」MUST 要件が型・書き込み経路レベルで未達 |
| request.md | △ | 受け入れ基準は storage レベルで満たされているが、fileContent / modelUsage の型除去が残存 |

---

## 1. tasks.md 全 checkbox 確認

T-08 に unchecked item が 1 件存在する。

```
- [ ] `StepOutcome.fileContent` を除去し、結果ファイル（実ファイル）を真実とする
      消費経路へ寄せる（pushStepResult / recordFailedStepResult / executor.finalizeStep
      の fileContent 受け渡しを削除）。
```

T-01〜T-19 のそれ以外すべての checkbox は `[x]`。

---

## 2. 設計決定（D1〜D9）実装確認

| 決定 | 状態 |
|------|------|
| D1 3ストア分離 | ✓ |
| D2 レコードスキーマ + fold | ✓ |
| D3 append / overwrite 物理分離 | ✓ |
| D4 history truncation 廃止（表示層 cap へ移動） | ✓ |
| D5 配置キー slug 化、request.slug / path 除去 | ✓ |
| D6 cost step-append、finish 一括廃止 | ✓ |
| D7 worktree 不変量 + dual-read 列挙 | ✓ |
| D8 machine-local sidecar 分離（worktreePath / pid / session → liveness.json） | ✓ |
| D9 非破壊移行（legacy dual-read、移行後も旧ファイルを削除しない） | ✓ |

---

## 3. spec.md 要件充足確認

| 要件 | 充足 |
|------|------|
| 単一 JSON の分割（段1） | ✓ |
| event 追記と cursor rewrite の物理分離 | ✓ |
| fold の partial 末尾無視 | ✓ |
| fold 結果が再開 routing / transition 判定を保持 | ✓ |
| change folder に journal / cursor / usage（段2） | ✓ |
| 同一 branch 再 checkout で resume | ✓ |
| machine-local を sidecar に分離 | ✓ |
| cost step-append / finish 一括廃止 | ✓ |
| 中断事由を interruption event 1 件で記録 | ✓ |
| history を経過トレースとして保持 | ✓ |
| archive で state を strip せず取り込む | ✓ |
| active 列挙を worktree 不変量 + dual-read で成立 | ✓ |
| worktree 存在 ⟺ 非終端の不変量と exit-guard | ✓ |
| 再 run は新 branch を生やし旧 attempt を破壊しない | ✓ |
| 旧 full state からの非破壊移行 | ✓ |
| pullRequest を state.json に materialize | ✓ |
| **導出可能フィールドと fileContent を state から除く** | **△** |
| pipeline 実行・画面出力・PR 生成が不変 | ✓ |

---

## 4. 要 fix 項目

### F-1: `StepOutcome.fileContent` が schema / 書き込み経路に残存（T-08 unchecked）

**残存箇所**:
- `src/state/schema.ts` line 93: `fileContent?: string | null;`（StepOutcome 内）
- `src/state/helpers.ts` line 102: `fileContent: partial.fileContent,`（pushStepResult が StepRun.outcome に set）
- `src/state/helpers.ts` line 29: `fileContent: run.outcome.fileContent,`（toLegacyStepResult 内）
- `src/core/step/executor.ts` line 523: `fileContent: resultContent,`（finalizeStep → pushStepResult）
- `src/core/step/build-fixer.ts` line 97: `buildFailureSection(verificationResult?.fileContent)`（in-memory から読む）

**storage への影響はない**: `stepRunToRecord` が `fileContent` を除外して `events.jsonl` に書くため、`state.json` / `events.jsonl` には含まれない。

**挙動上の問題**: fold は `fileContent` を復元しないため、CI 再 checkout 後の resume では `getLatestStepResult` が `fileContent = undefined` を返す。`build-fixer` の `buildFailureSection` が空文字列にフォールバックし、inline failure section がプロンプトに含まれなくなる（degraded behavior）。

**必要な修正**:
- `StepOutcome.fileContent` を schema から除去
- `executor.finalizeStep` / `pushStepResult` / `recordFailedStepResult` の `fileContent` 受け渡しを削除
- `build-fixer.ts` の `buildFailureSection` を `findingsPath` 経由の実ファイル読み込みに切り替え

### F-2: `StepRun.modelUsage` が schema に残存（checkbox と実装の乖離）

T-08 の `[x] StepRun.modelUsage を除去する` checkbox は完了扱いだが、`src/state/schema.ts` line 127 に `modelUsage?: Record<string, ModelUsage>;` が残っている。storage 影響はない（`stepRunToRecord` が除外）が、tasks.md 申告と実装が乖離している。型を除去して整合を取ること。

---

## 5. typecheck / test 確認

```
bun run typecheck → tsc --noEmit → exit 0 (clean)
bun run test     → 273 test files, 3234 tests — all passed
```

---

## 6. 総括

段1・段2 の storage 設計はすべて正しく実装されており、tests + typecheck も green。  
唯一のブロッカーは T-08 未完了の `fileContent` 除去（schema / 書き込み経路 / 消費経路の切り替え）と、`modelUsage` 型の除去（checkbox との整合）。`fileContent` 除去を完了することで approved に到達できる。
