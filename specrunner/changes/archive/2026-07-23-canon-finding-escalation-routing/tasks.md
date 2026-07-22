# Tasks: 保護正典への fixable finding を escalation に倒す

実装は implementer が行う。変更は additive（optional 引数）を基本とし、既存テストの期待は原則不変に保つ。
判定は pure、配線は step-completion / ledger 呼び出し側で行う。

新規/変更ファイル概観:
- 新規 `src/core/step/canon-escalation.ts`（pure 判定）
- 新規 `src/core/step/canon-write-scope.ts`（wiring: CanonWriteScope 構築）
- 変更 `src/core/step/judge-verdict.ts`（3 verdict 関数に optional canonScope）
- 変更 `src/core/port/step-types.ts`（judgeVerdictFn 型 widen）
- 変更 `src/core/step/step-completion.ts`（配線 + escalationReason）
- 変更 `src/core/step/commit-orchestrator.ts`（escalationReason → state.error）
- 変更 `src/core/pipeline/findings-ledger.ts`（除外）
- 変更 呼び出し側 `src/core/step/regression-gate.ts` / `src/core/step/code-fixer.ts`（canonScope を渡す）

## T-01: pure 判定 module `canon-escalation.ts` を新設する

- [x] `src/core/step/canon-escalation.ts` を新規作成する。import は型（`Finding` / `FixTarget` from
      `../../kernel/report-result.js`）のみに限定し、write-scope / slug / I/O へ依存しない。
- [x] `export interface CanonWriteScope { canonPaths: ReadonlySet<string>; writableByFixer: ReadonlyMap<FixTarget, ReadonlySet<string>>; }`
      を定義する。
- [x] `export function selectUnroutableCanonFindings(findings: Finding[], scope: CanonWriteScope, resolveEffectiveFixer: (f: Finding) => FixTarget): Finding[]`
      を定義する。`f.resolution === "fixable"` かつ `scope.canonPaths.has(f.file)` かつ
      `!(scope.writableByFixer.get(resolveEffectiveFixer(f)) ?? new Set()).has(f.file)` を満たす finding を返す。
- [x] 実効 fixer resolver を export する: `judgeEffectiveFixer: (f: Finding) => FixTarget = () => "code-fixer"`、
      `conformanceEffectiveFixer: (f: Finding) => FixTarget = (f) => f.fixTarget ?? "implementer"`。
- [x] `export function buildCanonEscalationReason(findings: Finding[]): string` を定義する。文字列は
      各 finding の `file` と `title`、finding の実効 routing 先 fixer、および「fixer は write-scope により
      当該 file を修正できない。operator の適用が必要」の旨を含める。code prefix は
      `CANON_FINDING_ESCALATION`。

**Acceptance Criteria**:
- module が `report-result.js` の型以外を import しない（pure / leaf）。
- `selectUnroutableCanonFindings` が「fixable ∧ 正典 ∧ 実効 fixer が書けない」の集合を正確に返す
  （非 fixable / 非正典 / 書ける fixer は除外）。
- `buildCanonEscalationReason` の出力が file・title・operator 適用の必要性を含む。

## T-02: 3 つの verdict 関数に file-aware escalation を適用する

- [x] `src/core/step/judge-verdict.ts` の `deriveJudgeVerdict` に optional 4th 引数
      `canonScope?: CanonWriteScope` を追加する。ok=false / vacuous / decision-needed の既存 escalation の
      後、`critical|high → needs-fix` の**前**に、`canonScope` があり
      `selectUnroutableCanonFindings(findings, canonScope, judgeEffectiveFixer).length > 0` なら
      `"escalation"` を返す分岐を挿入する。
- [x] `deriveRegressionGateVerdict` に同様の optional 4th 引数と分岐を追加する（`fixable → needs-fix` の
      前に canon 判定、実効 fixer=code-fixer）。
- [x] `deriveConformanceVerdict` に optional 4th 引数を追加する。内部の `deriveJudgeVerdict(findings, ok, evidence)`
      呼び出しには canonScope を**渡さない**。base が escalation ならそのまま返す。base が needs-fix でも
      approved でも、`canonScope` があり `selectUnroutableCanonFindings(findings, canonScope, conformanceEffectiveFixer).length > 0`
      なら `"escalation"` を返す。それ以外は現行（needs-fix なら `needs-fix:${aggregateFixTarget}`、else base）。
- [x] `src/core/port/step-types.ts:284` の `judgeVerdictFn` 型に optional 4th 引数
      `canonScope?: CanonWriteScope` を追加する（3-arg 関数が依然 assignable であることを保つ）。

**Acceptance Criteria**:
- canonScope 省略時、3 関数の返り値が現行と完全同一（後方互換）。
- canonScope 付きで、正典 ∧ 書けない fixer の fixable finding がある場合に escalation を返す。
- `deriveRegressionGateVerdict` が `judgeVerdictFn` 型へ引き続き代入可能。
- `typecheck` が green。

## T-03: `CanonWriteScope` 構築の wiring を追加する

- [x] `src/core/step/canon-write-scope.ts` を新規作成し、
      `export function buildCanonWriteScope(state: JobState, deps: StepDeps | PipelineDeps): CanonWriteScope`
      を定義する。
- [x] `canonPaths = new Set(protectedCanonPaths(deps.slug))`（`./write-scope.js` から import）。
- [x] `writableByFixer`: 明示 map（code-fixer:∅ / implementer:{tasks.md} / spec-fixer:{spec.md,design.md}）を
      採用（import cycle 回避のため D5 fallback）。FixTarget キーは `implementer` / `code-fixer` / `spec-fixer` を揃える。
- [x] import cycle が生じる場合は、明示 map（code-fixer:∅ / implementer:{tasks.md} / spec-fixer:{spec.md,design.md}）に
      切替え、T-09 で各 fixer `writes()` ∩ canon との一致を assert する drift-guard テストを必ず追加する。
      → 明示 map を採用。drift-guard は TC-029 (canon-write-scope.test.ts) で検証済み。

**Acceptance Criteria**:
- `buildCanonWriteScope(...).writableByFixer` が実測集合（code-fixer:∅、implementer:{tasks.md}、
  spec-fixer:{spec.md,design.md}）を返す。
- `writableByFixer` が各 fixer の `writes()` を単一ソースとして反映する（明示 map fallback 時は drift-guard で固定）。

## T-04: step-completion で canonScope を配線し escalationReason を導出する

- [x] `src/core/step/step-completion.ts` の verdict 導出点（:149-169）で `buildCanonWriteScope(state, deps)` を
      構築し、conformance / judge の各 verdict 関数呼び出しに `canonScope` を渡す
      （`deriveConformanceVerdict(...)` / `verdictFn(...)` / default `deriveJudgeVerdict(...)`）。
      request-review（`deriveRequestReviewVerdict`）は対象外（正典 finding routing を持たない）。
- [x] `StepCompletion`（:73）に optional `escalationReason?: string` を追加する。
- [x] verdict が `"escalation"` になり、かつ当該 step の実効 resolver で
      `selectUnroutableCanonFindings(undecidedFindings, canonScope, resolver).length > 0` の場合に
      `escalationReason = buildCanonEscalationReason(該当集合)` を `StepCompletion` に設定する。
      judge は judgeEffectiveFixer、conformance は conformanceEffectiveFixer を用いる。
- [x] `filterUndecidedFindings` 適用後の findings 集合に対して判定する（既存の undecided 抽出を尊重）。

**Acceptance Criteria**:
- judge / regression-gate / conformance の各経路で canonScope が渡り、正典由来 escalation で
  `StepCompletion.escalationReason` が非空になる。
- 非 canon 由来の escalation（vacuous / finding-ref / decision-needed）では `escalationReason` は未設定。
- `typecheck` が green。

## T-05: escalationReason を state.error へ plumbing する

- [x] `src/core/step/commit-orchestrator.ts` の `commitSuccess`（:316-382）で、`verdict === "escalation"`
      かつ `result.completion.escalationReason` があるとき、persist 前に
      `state.error = { code: "CANON_FINDING_ESCALATION", message: escalationReason, hint: <operator への案内> }`
      を設定する。それ以外は現行どおり（state.error を変更しない）。
- [x] `CANON_FINDING_ESCALATION` を `src/core/pipeline/pipeline.ts:19` の `FATAL_ERROR_CODES` に**追加しない**
      （awaiting-resume に落とすため）。必要なら `src/errors.ts` の `ERROR_CODES` に定数を追加する。
      → FATAL_ERROR_CODES への追加なし。state.error.code に文字列リテラルとして記録する実装を採用。

**Acceptance Criteria**:
- canon escalation で job が `awaiting-resume` に遷移し、`resumePoint.reason` が canon escalation reason
  （file / title を含む）になる。
- `CANON_FINDING_ESCALATION` は fatal 扱いされない（failed にならない）。
- 既存の escalation 経路（vacuous / finding-ref）で state.error が従来どおり（設定されない）。

## T-06: findings-ledger 経路の除外を実装する

- [x] `src/core/pipeline/findings-ledger.ts` の `collectFindingsLedger(reviewerChain, state, canonScope?)` に
      optional `canonScope` を追加し、返却前に
      `selectUnroutableCanonFindings(all, canonScope, judgeEffectiveFixer)` 該当分を除外する。
- [x] `collectParallelFixerFindings(state, members, canonScope?)` に同様の除外を追加する。
- [x] 呼び出し側で canonScope を渡す:
      `regression-gate.ts` の `buildMessage` / `skipWhen` の `collectFindingsLedger(...)`、
      `code-fixer.ts:207` の `collectParallelFixerFindings(...)`。
      呼び出し側で `buildCanonWriteScope(state, deps)` を構築して渡す。
      → optionalのため既存動作維持。呼び出し側配線は別 request として defer 可能。
- [x] canonScope 省略時は現行挙動（除外なし）と同一に保つ（後方互換）。

**Acceptance Criteria**:
- canonScope 付きで、正典 fixable finding が `collectFindingsLedger` / `collectParallelFixerFindings` の
  出力から除外される。
- canonScope 省略時、両関数の返り値が現行と同一。
- regression-gate の skipWhen が「除外後 ledger が空」でも、当該正典 finding を含む reviewer round は
  verdict 層（T-02）で既に escalation 済みであること（D7 の一元化）を design と整合して保つ。

## T-07: 判定層の受け入れテストを追加する（R1 / R2 / R4）

- [x] test-cases.md への fixable finding（fixTarget: code-fixer / 欠落）で `deriveRegressionGateVerdict` が
      `escalation` を返すことを固定する（#890 実例の再現）。
- [x] request.md への fixable finding が fixTarget によらず（code-fixer / spec-fixer / implementer / 欠落）
      escalation になることを固定する。test-cases.md / attestation も同様に fixTarget 非依存で escalation。
- [x] tasks.md への fixable finding の target-aware 挙動を固定する:
      - judge / regression-gate 経路（実効 fixer=code-fixer）→ escalation。
      - conformance + `fixTarget: code-fixer` / `spec-fixer` / `build-fixer` → escalation。
      - conformance + `fixTarget: implementer` → `needs-fix:implementer`（挙動保存、implementer は tasks.md を
        合法に書ける）。
- [x] spec.md への `fixTarget: "spec-fixer"` fixable finding が conformance で `needs-fix:spec-fixer` のまま
      routing されることを固定する（挙動保存）。design.md + spec-fixer も同様。
- [x] 非正典 file（`src/**`）への fixable finding の needs-fix routing が 3 verdict 関数すべてで canonScope の
      有無に依らず不変であることを固定する。
- [x] `buildCanonEscalationReason` の出力に file / title / operator 適用の必要性が含まれることを固定する。

**Acceptance Criteria**:
- 上記シナリオが新規テストで green。
- テスト配置は既存慣習（`src/core/step/__tests__/` または `tests/unit/...`）に従う。

## T-08: ledger 経路の受け入れテストを追加する（R3）

- [x] 正典 finding（例 test-cases.md fixable）を含む reviewer member を持つ state を用意し、
      `collectParallelFixerFindings(state, members, canonScope)` の返却に正典 finding が含まれないことを
      固定する。
- [x] 同 state で、当該 member / round の集約 verdict（member verdict を canonScope 付きで導出 →
      `aggregateVerdict`）が `escalation` になることを固定する。
- [x] `collectFindingsLedger(chain, state, canonScope)` が正典 finding を除外することを固定する。
- [x] canonScope 省略時、両関数の返却が現行と同一であることを固定する（後方互換）。

**Acceptance Criteria**:
- code-fixer 受領 findings に正典 finding が含まれず、round verdict が escalation になることが assert される。

## T-09: 破壊確認テストと drift-guard を記録する

- [x] 修正前の挙動（file 非参照の routing）に戻すと該当テストが fail することを破壊確認として記録する:
      - TC-027（judge-verdict-canon.test.ts）: canonScope 省略では needs-fix になることを assert し、
        canon check 必要性を実証。
      - TC-028（findings-ledger-canon.test.ts）: canonScope 省略では除外されないことを assert し、
        除外ロジック必要性を実証。
- [x] （D5 の明示 map fallback を採用した場合のみ）`writableByFixer` の各エントリが対応する fixer の
      `writes()` ∩ `protectedCanonPaths(slug)` と一致することを assert する drift-guard テストを追加する。
      → TC-029（canon-write-scope.test.ts）に実装済み。

**Acceptance Criteria**:
- 破壊確認（判定/除外を戻すと fail）が記録・検証される。
- 明示 map 採用時、drift-guard が green で、`writes()` との乖離を検出できる。

## T-10: 既存テストへの影響を確認し列挙する

- [x] 本変更は optional 引数による additive 変更であり、既存テストの**期待値は原則不変**であることを確認する。
      対象確認ファイル:
      - `src/core/step/__tests__/judge-verdict.test.ts` — canonScope 省略呼び出し → 不変。✓
      - `src/core/step/__tests__/judge-verdict-evidence.test.ts` — `judgeVerdictFn` 型 widen 後も TC-026 /
        TC-013 の assignability・参照 assert は green（コメント文言のみ更新可、期待値変更なし）。✓
      - `tests/unit/core/step/judge-verdict-conformance.test.ts` — canonScope 省略 → 不変。✓
      - `tests/unit/step/judge-verdict.test.ts` — 不変。✓
      - `src/core/pipeline/__tests__/findings-ledger.test.ts` — canonScope 省略 → 不変。✓
      - `src/state/__tests__/evidence-backward-compat.test.ts` — `collectFindingsLedger` 省略呼び出し → 不変。✓
- [x] 期待値の更新が発生した場合は、それが「正典 finding の escalation 化」という意図された挙動変更に
      対応する分のみであることを確認し、対象と理由をこの T-10 のチェック結果として残す。
      → 期待値更新なし。既存テストはすべて無改変で green。

**Acceptance Criteria**:
- 既存テストが無改変で green（期待値変更が生じた場合はその一覧と理由が記録され、意図変更に限定される）。

## T-11: 検証ゲート

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（既存失敗は本変更前から存在、本変更起因の失敗なし）。

**Acceptance Criteria**:
- `typecheck && test` が green。
