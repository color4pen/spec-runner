# Conformance Result — absorb-build-fixer (Iteration 2)

## 検証した項目

### Gate: typecheck && test

```
Test Files  770 passed (770)
      Tests  11493 passed | 1 skipped (11494)
   Duration  37.47s
```

`bun run typecheck` (tsc --noEmit): no errors.

---

### Req 1: verification 失敗は implementer へ再入する (SHALL / MUST NOT)

**STANDARD_TRANSITIONS** (`src/core/pipeline/types.ts:294`):
`{ step: VERIFICATION, on: "failed", to: IMPLEMENTER }` — 存在する。BUILD_FIXER への行なし。

**FAST_TRANSITIONS** (`src/core/pipeline/types.ts:350`):
`{ step: VERIFICATION, on: "failed", to: IMPLEMENTER }` — 存在する。BUILD_FIXER への行なし。

テスト: TC-001, TC-002, TC-013 — green。

---

### Req 2: 再入は直前 implementer session の継続として実行し失敗内容を渡す (SHALL / MUST)

`step-context-builder.ts:101-106` — `implementer && verificationFailedLast(state)` のとき
`getPreviousSessionId(state, IMPLEMENTER) ?? undefined` を `resumeSessionId` に渡す。

`implementer.ts:308-319` — `buildImplementerRecoveryMessage` が `## Verification Failures` を含む
失敗内容を message に展開する（`enrichContext` が best-effort で verification-result.md を先読み）。

テスト: TC-003 — resumeSessionId=前回ID, message に "## Verification Failures" — green。

---

### Req 3: 継続元 session が無い場合は fresh session に fallback する (SHALL / MUST)

`getPreviousSessionId(...) ?? undefined` → null/不在のとき undefined(fresh)。例外なし。

fresh fallback は `buildImplementerInitialMessage`(tasks/spec 案内)に
`buildFailureSection` を付す(`implementer.ts:322-337`)。失敗内容は引き続き含まれる。

テスト: TC-004 — resumeSessionId===undefined (null sessionId / 前回 run なし両ケース) — green。

---

### Req 4: 再入指示は失敗解消のみで機械的修正制約を課さない (SHALL / MUST NOT)

`buildImplementerRecoveryMessage` は "verification が失敗した" + canon 整合指示のみ。
"機械的修正のみ" "設計判断禁止" "Fix the errors mechanically" "NO design decisions" "mechanically" の文言なし。

テスト: TC-005 — 制約文言 not.toContain — green。

---

### Req 5: verification 再入回数の上限は維持される (MUST)

`registry.ts:67` — `loopFixerPairs[VERIFICATION] = IMPLEMENTER` (STANDARD/FAST 両 descriptor)。

`pipeline.ts:467` — `currentStep === exhaustedReviewer` guard により、
`spec-review approved → implementer(isTestGenExempt)` の creator 経路は
verification fixer budget に誤って引っかからない。

`types.ts:282-283` — `verificationFailedLast` guard により recovery 再入が bite-evidence を
バイパスして verification に直帰し、予算が spurious reset されない。

テスト: TC-006 (VERIFICATION_RETRIES_EXHAUSTED 発火), TC-007 (conformance 再検証 fresh 予算),
TC-016 (spec-review→implementer creator 経路が budget に阻まれない) — green。

---

### Req 6: build-fixer 実行歴を含む既存 state は互換に扱われる (SHALL / MUST)

fold: `StepName = string` passthrough により `state.steps["build-fixer"]` は保持され無視される。

resume: `LEGACY_STEP_ALIASES = { "build-fixer": IMPLEMENTER }` (`resolve-step.ts:17-19`)。
`from` と `resumePoint.step` の両経路で `allowed.has()` 検証より前に適用される。

テスト: TC-008 (fold エラーなし・実行歴保持), TC-009 (resolveResumeStep("build-fixer")→"implementer") — green。

---

### Acceptance Criteria チェック

| 受け入れ基準 | 状態 | テスト |
|---|---|---|
| verification 失敗時に implementer へ遷移(通常・chore 両経路) | ✅ | TC-001, TC-002 |
| 再入が継続 session で起動され失敗内容が message に含まれる | ✅ | TC-003 |
| 継続元 session 無しで fresh fallback、エラーなし | ✅ | TC-004 |
| ループ上限(RETRIES_EXHAUSTED)が再入方式でも機能 | ✅ | TC-006 |
| build-fixer 実行歴を含む state の読み込みと resume が壊れない | ✅ | TC-008, TC-009 |
| 遷移表・build-fixer 関連テストの更新対象を design で全列挙し根拠明示 | ✅ | design.md §Test更新対象全列挙 |
| typecheck && test が green | ✅ | 11493/11494 passed |

---

### 削除の確認

| 対象 | 状態 |
|---|---|
| `src/core/step/build-fixer.ts` | 削除済み |
| `src/prompts/build-fixer-system.ts` | 削除済み |
| `AGENT_STEP_NAMES` に build-fixer なし | ✅ |
| `STEP_NAMES.BUILD_FIXER` なし | ✅ |
| `AgentStepName` union に build-fixer なし | ✅ |
| `FIXER_STEP_NAMES` に build-fixer なし | ✅ |
| `GUARDED_WRITE_STEPS` に build-fixer なし | ✅ |
| Doctor checks に build-fixer 要求なし | ✅ |
| `managed.ts` / `config-effective.ts` に build-fixer 登録なし | ✅ |
| `--from` 候補に build-fixer 含まれない | ✅ |

---

## 検証できなかった項目

None。

---

## Findings 詳細

### 計画乖離(非 normative)

以下のファイルにスタールコメントが残っている。挙動に影響しないため spec.md/request.md 正規要件への違反ではなく、tasks.md T-08 の計画乖離として記録する。

| ファイル | 内容 |
|---|---|
| `src/git/dynamic-context.ts:28-29` | `verificationContent` doc が "Populated by BuildFixerStep.enrichContext()" と記述(実際は ImplementerStep) |
| `src/core/step/verification.ts:25,38,61,78` | 4 件のコメントが build-fixer step を言及 |
| `src/core/port/agent-runner.ts:54` | "fixer ステップ（spec-fixer / build-fixer / code-fixer）" の記述 |
| `src/core/port/report-result.ts:126` | step 列挙コメントに build-fixer が含まれる |

これらは typed findings には含めない。
