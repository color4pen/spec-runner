# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準 ✓

| AC | 検証方法 | 結果 |
|---|---|---|
| verification 失敗時に implementer へ遷移(STANDARD/FAST) | `STANDARD_TRANSITIONS`/`FAST_TRANSITIONS` を直読み + TC-001/002 | ✓ |
| 再入 implementer が直前 session の継続として起動 + 失敗内容を message に含む | `step-context-builder.ts:101-106` + `implementer.ts:308-319` + TC-003 | ✓ |
| 継続元 session が無い場合は fresh session で fallback | `getPreviousSessionId` null → `undefined` の null 合体 + TC-004 | ✓ |
| ループ上限(VERIFICATION_RETRIES_EXHAUSTED)が再入方式でも機能 | `loopFixerPairs[VERIFICATION]=IMPLEMENTER` による `newEpisode=false` 積み上げ + TC-006 | ✓ |
| build-fixer 実行歴を含む既存 state の読み込み・resume が壊れない | `StepName=string` passthrough + `LEGACY_STEP_ALIASES["build-fixer"]→implementer` + TC-008/009 | ✓ |
| 遷移表・build-fixer 関連テストの更新対象を design で全列挙 | design.md 表 A〜E を照合、diff で確認 | ✓ |
| typecheck && test が green | verification-result.md: Verdict: passed | ✓ |

### 実装の核心部分 ✓

**D1 — loopFixerPairs[VERIFICATION] = IMPLEMENTER**

`registry.ts` の STANDARD/FAST 両 descriptor で `loopFixerPairs[STEP_NAMES.VERIFICATION] = STEP_NAMES.IMPLEMENTER`。これにより:
- `verification failed → implementer` 遷移が paired fixer 経由となり `newEpisode=false` → 予算積み上げ → `VERIFICATION_RETRIES_EXHAUSTED` 発火
- `conformance → verification` 再検証は `currentStep(conformance) ≠ pairedFixer(implementer)` → `newEpisode=true` → fresh 予算でリセット

**D1 — fixerNamesForReroute guard の安全性**

`pipeline.ts` の "Approved verdict overturned by fixer budget" ブロック(`fixerNamesForReroute`)が implementer を含むが、guard 条件 `currentStep === exhaustedReviewer` により:
- `spec-review approved → implementer (isTestGenExempt)`: `currentStep=spec-review ≠ verification` → 誤 intercept 無し ✓
- `conformance needs-fix:implementer → implementer`: `outcome ≠ "approved"` → ブロック未到達 ✓

**D2 — IMPLEMENTER→VERIFICATION(verificationFailedLast) の first-match-wins 位置**

```
line 280: { IMPLEMENTER, success, VERIFICATION, when: isTestGenExempt }
line 283: { IMPLEMENTER, success, VERIFICATION, when: verificationFailedLast }  ← ADD
line 284: { IMPLEMENTER, success, BITE_EVIDENCE }
```

- 非 exempt 回復時: `isTestGenExempt=false`→280 skip、`verificationFailedLast=true`→283 fire → VERIFICATION (bite-evidence bypass) ✓
- 非 exempt 初回: 両 when false → 284 fire → BITE_EVIDENCE ✓
- exempt 初回・回復: `isTestGenExempt=true`→280 fire → VERIFICATION ✓

**D3 — enrichContext / buildMessage / resumeSessionId の配線**

1. `ImplementerStep.enrichContext` が verification-result.md を best-effort 先読み → `dynamicContext.verificationContent`
2. `agent-runner.ts:508-510` で enrichContext 後に `buildMessage` 呼び出し
3. `buildMessage` が `verificationFailedLast(state)` を判定:
   - `getPreviousSessionId !== null` → `buildImplementerRecoveryMessage`(verificationContent 付き)
   - `getPreviousSessionId === null` → `buildImplementerInitialMessage` + failureSection 追記(fresh fallback)
4. `step-context-builder.ts:101-106` で `verificationFailedLast` 真かつ implementer のとき `getPreviousSessionId ?? undefined` を `resumeSessionId` にセット

制約文言("機械的修正のみ" 等) なし確認 ✓

**D4 — 後方互換**

- `LEGACY_STEP_ALIASES = { "build-fixer": STEP_NAMES.IMPLEMENTER }` が `from` および `resumePoint.step` 両経路に適用
- `from` 経路: alias 解決後に `allowed.has()` 検証 → `"build-fixer"` が invalid で拒否されない ✓
- `StepName=string` / passthrough により既存 state の fold は無変更 ✓

### 削除確認 ✓

- `src/core/step/build-fixer.ts` — 削除済み
- `src/prompts/build-fixer-system.ts` — 削除済み
- `AGENT_STEP_NAMES`, `STEP_NAMES.BUILD_FIXER` から build-fixer 除去確認
- `FIXER_STEP_NAMES`, `GUARDED_WRITE_STEPS`, `IMPL_CODE_MUTATOR_STEPS` から除去確認
- doctor チェック、managed.ts、config-effective.ts から除去確認
- `--from` 候補に build-fixer が含まれないこと (TC-019) ✓

### テスト網羅 ✓

新規テストファイル 4 本が TC-001〜TC-019 をカバー:

| ファイル | カバー TC |
|---|---|
| `tests/unit/absorb-build-fixer/transitions.test.ts` | TC-001/002/010-016/019 |
| `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` | TC-003/004/005/017/018 |
| `tests/unit/absorb-build-fixer/state-compat.test.ts` | TC-008/009 |
| `tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts` | TC-006/007 |

## 検証できなかった項目

- **managed runtime での session 継続**: スコープ外、確認なし
- **実際の SDK session resume**: ユニットテストレベルの確認のみ。SDK adapter の resume 実行は mock 済み

## Findings 詳細

### F-001 (low): 未編集ファイルに stale な build-fixer コメントが残存

T-08「編集済みファイル内のコメントを整合させる」が `[x]` だが、diff 外のファイル群に stale 参照が残る:

- `src/core/verification/propagate.ts` — "build-fixer step が managed agent で読む" 旨の記述
- `src/core/verification/reload-coverage-config.ts` — "build-fixer during" の記述
- `src/core/verification/parse-result.ts` — "for use in build-fixer context"
- `src/core/step/staging-containment.ts` — "implementer / build-fixer" 列挙
- `src/core/step/commit-push.ts` — "implementer, build-fixer, code-fixer"
- `src/core/step/canon-write-scope.ts` — "code-fixer and build-fixer" 複数箇所
- `src/core/port/step-types.ts` — "and build-fixer" 参照
- `src/core/port/agent-runner.ts` — "build-fixer / code-fixer" 列挙

T-08 が "最小限に留める(green には不要)" と明示しており、挙動・テストへの影響は無い。将来の保守者を混乱させるリスクはあるが、緊急性は低い。

### F-002 (low): `types.ts` コメントの軽微な誤記

`STANDARD_TRANSITIONS` の `verificationFailedLast` 行コメント:
```
// (first-match-wins: must precede unconditional BITE_EVIDENCE row and isTestGenExempt row above)
```
実際には `isTestGenExempt` 行(280行目)の**後**に配置されており "precede isTestGenExempt row above" は不正確。ただし両行とも `to=VERIFICATION` のため first-match-wins 順は機能上無関係。コメントのみの問題。

---

*以上。両 findings ともドキュメント/コメントレベルで挙動に影響しない。AC はすべて満たされている。*
