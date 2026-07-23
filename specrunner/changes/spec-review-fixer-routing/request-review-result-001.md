# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: 現状コードの前提（コードアサーション）の検証

request.md に記載された 9 件のコードアサーションをすべて Read tool で確認した。

| アサーション | 検証結果 |
|---|---|
| `canon-escalation.ts:41` — `judgeEffectiveFixer` は常に `"code-fixer"` を返す | ✅ 一致（line 41: `= () => "code-fixer"`） |
| `judge-verdict.ts:53` — `deriveJudgeVerdict` は `judgeEffectiveFixer` 固定で `selectUnroutableCanonFindings` を呼ぶ | ✅ 一致（line 53 に該当 call） |
| `canon-write-scope.ts:47` — code-fixer の書込集合は ∅ | ✅ 一致（line 47: `["code-fixer", new Set<string>()]`） |
| `spec-review.ts:69` — `reportTool: JUDGE_REPORT_TOOL`、`judgeVerdictFn` 未定義 | ✅ 一致（line 69）、`SpecReviewStep` に `judgeVerdictFn` フィールドなし |
| `judge-verdict.ts:53-56` — canon 判定が critical\|high → needs-fix の前段にある | ✅ 一致（lines 52-55 = canon check、line 56 = critical\|high check） |
| `canon-write-scope.ts:51` — spec-fixer の書込集合は `{spec.md, design.md}` | ✅ 一致（line 51） |
| `types.ts:234` — `spec-review needs-fix → spec-fixer` 遷移あり | ✅ 一致（line 234） |
| `types.ts:241` — `spec-fixer approved → spec-review` 遷移あり | ✅ 一致（line 241） |
| `step-completion.ts:306` — escalationReason 計算が `lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer` | ✅ 一致（line 306） |
| `judge-verdict.ts:100-119` — conformance は `conformanceEffectiveFixer` を使用 | ✅ 一致（`deriveConformanceVerdict` line 111） |

### Step 2: 問題の再現性確認

以下のコードパスを追跡し、問題が実際に発生することを確認した。

1. spec-review ステップは `reportTool: JUDGE_REPORT_TOOL` → `isJudgeStep = true`
2. `judgeVerdictFn` 未定義 → `verdictFn = deriveJudgeVerdict`
3. `deriveJudgeVerdict(findings, ok, evidence, canonScope)` を呼ぶ
4. canon check: `selectUnroutableCanonFindings(findings, canonScope, judgeEffectiveFixer)`
5. `judgeEffectiveFixer` = 常に `"code-fixer"`
6. code-fixer の書込集合 = ∅ → spec.md も design.md も書けない → unroutable
7. →  `return "escalation"` (line 54、severity 判定の前段)
8. `spec-review needs-fix → spec-fixer` の遷移は存在するが、verdict が escalation になるため到達不能

### Step 3: 設計の妥当性確認

**スコープ外の確認**
- `protectedCanonPaths(slug)` が返すパス: `request.md`, `spec.md`, `design.md`, `tasks.md`, `test-cases.md`, factCheckAttestation — 確認済み（write-scope.ts:64-73）
- spec-fixer の書込集合 `{spec.md, design.md}` はこのうちの 2 ファイル。`request.md`, `tasks.md`, `test-cases.md`, attestation は spec-fixer も書けない → 引き続き escalation が正しい動作（Requirement 3 の根拠）

**ループ有界性**
- `registry.ts` の `STANDARD_DESCRIPTOR` で `loopNames` に `SPEC_REVIEW` が含まれ、`loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` が宣言されている
- `maxIterationsByStep` に spec-review の個別設定なし → グローバル `maxIterations` が上限として機能
- `spec-review needs-fix → spec-fixer → spec-review` ループは既存の遷移で構成されており、新規の無限経路は作らない

**step-completion ドリフト懸念（Requirement 4）**
- `step-completion.ts:306` の escalationReason 計算は `!lastIsConformancePath` の場合に `judgeEffectiveFixer`（= code-fixer）を使う
- 修正後、spec-review の verdict 導出は `specReviewEffectiveFixer`（= spec-fixer）を使う
- 実際に escalation になるのは spec-fixer が書けないファイル（request.md 等）への fixable finding のみ。これらは code-fixer も書けないため、escalationReason は同じ結果になる
- しかし「同一定義を参照する」原則として修正は必要であり、要件の意図は正しい

**TC-021 への影響**
- `judge-verdict.test.ts:386-413` の TC-021 は inline step（`judgeVerdictFn` なし）+ `src/example.ts`（非 canon ファイル）+ medium fixable で "approved" をテスト
- 修正後も `src/example.ts` は非 canon ファイルのため、新しい spec-review `judgeVerdictFn` でも approved が返る
- テストの assertion 自体は unchanged で green になるが、コメント "judgeVerdictFn absent → falls back to deriveJudgeVerdict" は実際の SpecReviewStep の挙動を表さなくなる（非ブロッキング）

**canon-write-scope.ts コメント参照の drift-guard テスト**
- `canon-write-scope.ts:7,33` に「drift-guard test (TC-029) validates that the explicit map values match each fixer's actual writes() ∩ protectedCanonPaths」とあるが、`src/core/step/__tests__/canon-write-scope.test.ts` は現時点で存在しない
- 本 request の受け入れ基準の「drift-guard テストで固定する」はこの既存コメントの意図に対応している

### Step 4: 受け入れ基準の実現可能性確認

| 基準 | 判定 |
|---|---|
| spec.md への medium/fixable finding → needs-fix かつ spec-fixer に到達をテストで固定 | 実現可能（`judgeVerdictFn` + spec-review専用関数） |
| request.md への fixable finding → escalation + escalationReason 設定をテストで固定 | 実現可能（spec-fixer は request.md を書けない → unroutable） |
| 同一 resolver 参照の drift-guard テスト | 実現可能（step-completion の resolver 更新 + テスト追加） |
| ループ有界性のテスト固定 | 実現可能（既存ループ exhaustion 機構で対応済み） |
| judge / conformance / regression-gate / request-review 既存テスト green | 変更範囲が spec-review に限定されるため影響なし |
| `typecheck && test` green | 型安全な設計のため達成可能 |

## 検証できなかった項目

None — すべての主要アサーションとロジックパスをコードで確認した。

## Findings 詳細

None — ブロッキングな問題は発見されなかった。上記の TC-021 コメント・drift-guard テスト未作成はいずれも本 request の実装スコープで対処される事項。
