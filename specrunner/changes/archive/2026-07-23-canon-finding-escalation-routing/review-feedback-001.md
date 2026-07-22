# Review Feedback — canon-finding-escalation-routing — Iteration 1

## 検証した項目

### 読んだファイル・辿った diff

- `src/core/step/canon-escalation.ts` — pure module の設計と filter/reason-builder の実装
- `src/core/step/canon-write-scope.ts` — D5 の明示マップと drift-guard への言及
- `src/core/step/judge-verdict.ts` — 3関数への canonScope optional 第4引数追加、挿入位置
- `src/core/step/step-completion.ts` — canonScope 構築・配線、escalationReason 計算（:148, :279-286）
- `src/core/step/regression-gate.ts` — buildCanonWriteScope + collectFindingsLedger(canonScope) 配線
- `src/core/step/code-fixer.ts` — collectParallelFixerFindings(canonScope) 配線（:208-209）
- `src/core/step/commit-orchestrator.ts` — CANON_FINDING_ESCALATION error 書込（:362-372）
- `src/core/pipeline/findings-ledger.ts` — collectFindingsLedger/collectParallelFixerFindings の optional canonScope と除外ロジック
- `src/core/port/step-types.ts` — judgeVerdictFn 型の第4引数 widen
- `src/core/step/write-scope.ts` — protectedCanonPaths の実際の内容を確認（6ファイル）
- `src/core/pipeline/pipeline.ts` — FATAL_ERROR_CODES の内容（CANON_FINDING_ESCALATION が含まれないことを確認）
- 全テストファイル（4新規ファイル）— TC-ID と実装の対応を逐次確認
- `specrunner/changes/canon-finding-escalation-routing/verification-result.md` — 615 test files / 9008 tests passed

### Must-TC 対応確認

全 23 must-priority TC を各テストファイルで確認済み（下表）。

| TC | テストファイル |
|----|---------------|
| TC-001 | judge-verdict-canon.test.ts |
| TC-002 | judge-verdict-canon.test.ts（regression-gate: 4 fixTarget、judge/conformance: 主要 fixTarget） |
| TC-003 | judge-verdict-canon.test.ts（3関数それぞれ） |
| TC-004 | judge-verdict-canon.test.ts |
| TC-005 | judge-verdict-canon.test.ts |
| TC-006 | judge-verdict-canon.test.ts（code-fixer / spec-fixer 両方） |
| TC-007 | findings-ledger-canon.test.ts |
| TC-008 | canon-escalation.test.ts（file / title / operator 文言） |
| TC-009 | pipeline-fatal-codes.test.ts（structural: source に awaiting-resume / resumePoint が存在する） |
| TC-013 | judge-verdict-canon.test.ts |
| TC-014 | judge-verdict-canon.test.ts |
| TC-015 | judge-verdict-canon.test.ts |
| TC-018 | canon-write-scope.test.ts |
| TC-019 | canon-write-scope.test.ts |
| TC-020 | judge-verdict-canon.test.ts（#890 実例: fixTarget 欠落 → escalation） |
| TC-021 | judge-verdict-canon.test.ts（judge / regression-gate 両経路） |
| TC-022 | judge-verdict-canon.test.ts |
| TC-024 | pipeline-fatal-codes.test.ts（source regex で FATAL_ERROR_CODES 集合内を検証） |
| TC-025 | findings-ledger-canon.test.ts |
| TC-026 | findings-ledger-canon.test.ts |
| TC-027 | judge-verdict-canon.test.ts（canonScope 省略→needs-fix で旧挙動を実証） |
| TC-028 | findings-ledger-canon.test.ts（canonScope 省略→正典 finding が届くことを実証） |
| TC-030 | verification-result.md（typecheck & 9008 tests green） |

Should-priority: TC-010, TC-011, TC-012, TC-016, TC-017, TC-029 — 実装済み。
Should-priority TC-023 — 未実装（下記 F-003 参照）。

### 受け入れ基準との照合

- **test-cases.md fixable → regression-gate escalation**: TC-001 / TC-020 で固定 ✓
- **request.md fixable は fixTarget によらず escalation**: TC-002 で固定（regression-gate は全 4 fixTarget、judge/conformance は主要 fixTarget を網羅。judge 経路は judgeEffectiveFixer が常に code-fixer を返すため全 fixTarget を個別テストしなくても判定根拠は同一）✓
- **tasks.md: implementer+conformance → needs-fix:implementer、他 → escalation**: TC-005/TC-006/TC-021 で固定 ✓
- **spec.md + spec-fixer → needs-fix:spec-fixer 挙動保存**: TC-004/TC-022 で固定 ✓
- **非正典 file → routing 不変（3関数）**: TC-003 で固定 ✓
- **ledger: 正典 finding を code-fixer に渡さない**: TC-007 で固定 ✓
- **escalation reason に file/title/operator 適用が含まれる**: TC-008 で固定 ✓
- **破壊確認**: TC-027/TC-028 で記録 ✓
- **既存テスト期待更新は意図変更のみ**: 既存テストは無変更、新規テストのみ追加を確認 ✓
- **typecheck && test green**: verification-result.md で確認 ✓

### 設計整合の確認

- `judgeEffectiveFixer = () => "code-fixer"` は reviewer-chain.ts の needs-fix → code-fixer / approved+fixable → code-fixer と一致 ✓
- `conformanceEffectiveFixer = (f) => f.fixTarget ?? "implementer"` は aggregateFixTarget の default と一致 ✓
- `buildCanonWriteScope` が `protectedCanonPaths(slug)` を単一ソースとして使用 ✓
- `CANON_FINDING_ESCALATION` が `FATAL_ERROR_CODES` に含まれず awaiting-resume に倒れる ✓（pipeline.ts grep: CANON_FINDING_ESCALATION はソースに存在しない）

## 検証できなかった項目

- `step-completion.ts` の escalationReason 計算パス（:279-286）は直接単体テストされておらず、integration 的な確認のみ（TC-030 の全テスト pass で間接的に確認）。
- TC-009「awaiting-resume に落ちる」は structural check（source に awaiting-resume / resumePoint が存在すること）であり、実際の状態遷移を e2e で追っていない。

## Findings 詳細

### F-001: escalationReason の後因果判定（低重篤度）

`step-completion.ts:279-286` の escalationReason 計算は、escalation の実際の原因を問わず「`verdict === "escalation"` かつ `selectUnroutableCanonFindings(lastUndecidedFindings, ...)` が非空」であれば設定する。

```typescript
if (verdict === "escalation" && lastUndecidedFindings !== null) {
  const unroutable = selectUnroutableCanonFindings(lastUndecidedFindings, canonScope, resolver);
  if (unroutable.length > 0) {
    escalationReason = buildCanonEscalationReason(unroutable);
  }
}
```

エッジケース: `ok=false`（エージェント自発的失敗、:49）または finding-ref 検証失敗（:237 の override）が escalation を引き起こした場合に、同じ findings セットに canon fixable finding が混在していると `state.error.code = "CANON_FINDING_ESCALATION"` が誤って設定される。Operator が「write-scope の正典修正が必要」と誤読するリスクがある。

設計 D6 は「verdict が canon 由来で escalation になった場合」と記述しているが、実装は因果を確認せず両条件を独立にチェックしている。実運用上は ok=false + canon fixable finding の共存は稀であるため実害は限定的。

### F-002: step-types.ts コメントの陳腐化（低重篤度）

`step-types.ts:281` のコメント:

```
functions with only 2 arguments (e.g. deriveRegressionGateVerdict) are still assignable
```

本 PR で `deriveRegressionGateVerdict` は 4引数になったため「2引数のみ」という例示は不正確。TC-016 でテスト済みの assignability 自体は正しいが、コメントが実態と乖離している。

### F-003: TC-023 未実装（should 優先度）

"非 canon 由来 escalation で `StepCompletion.escalationReason` は未設定" を検証する TC-023 が実装されていない。`step-completion.ts` の escalationReason 計算パスは直接テストされておらず、F-001 で指摘したエッジケースを機械的に検出するテストが存在しない。
