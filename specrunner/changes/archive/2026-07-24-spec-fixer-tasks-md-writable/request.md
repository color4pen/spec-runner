# spec-fixer の書込集合に tasks.md を加え、tasks.md への fixable finding を pipeline 内で収束させる

## Meta

- **type**: spec-change
- **slug**: spec-fixer-tasks-md-writable
- **base-branch**: main
- **adr**: true

## 背景

spec-review の fixable canon finding は、spec-fixer が書込可能な file（spec.md / design.md）については severity 不問で needs-fix → spec-fixer に routing され pipeline 内で収束する。しかし tasks.md は spec-fixer の canon 書込集合外のため unroutable 判定となり、tasks.md への fixable finding（テスト計画の補強等、design 既決事項の転記型が大半）は依然として CANON_FINDING_ESCALATION で operator 停止する。

実運用では canon escalation の過半が tasks.md への転記型 finding であり、現時点で最頻の停止要因である。spec-review は tasks.md を読んで整合性をレビューするのに、round 内の誰もそれを修正できない——「指摘はできるが修正経路が無い」非対称がファイル 1 つ分残っている。

tasks.md は design step が spec.md / design.md と同時に生成する同格の派生成果物であり、spec round の収束対象から除外する理由がない。

## 現状コードの前提

- src/core/step/spec-fixer.ts:99-105 — `writes()` は `{design.md, spec.md}` のみを返す。spec-fixer は scoped mode（`GUARDED_WRITE_STEPS` 外、src/core/step/write-scope.ts:33-53）のため、この宣言が permission 層の書込許可集合を兼ねる
- src/core/step/canon-write-scope.ts:45-52 — D5 明示 map の spec-fixer entry は `{spec.md, design.md}`
- tests/unit/core/step/canon-write-scope.test.ts — TC-019 が spec-fixer writable = `{spec.md, design.md}` を期待し、TC-029 drift-guard が map と `writes() ∩ protectedCanonPaths` の一致を機械検証する
- src/core/step/judge-verdict.ts — `deriveSpecReviewVerdict` は routable / unroutable を書込集合から導出するため、集合の拡張だけで tasks.md finding の verdict が escalation → needs-fix に変わる（verdict 関数自体の変更は不要）
- src/core/step/spec-fixer.ts:135 — prompt が「fix the spec.md or design.md artifact」と修正対象を 2 file に限定している（normal entry 側も同様の対象記述）
- src/core/step/__tests__/spec-review-fixer-routing.test.ts — TC-013 が「tasks.md への fixable finding は escalation」を期待しており、本変更で期待が変わる
- src/core/step/judge-verdict.ts:100-119 — conformance の `needs-fix:spec-fixer` routing は `conformanceEffectiveFixer`（fixTarget 尊重）経由で、書込集合の拡張に自然に追随する

## 要件

1. spec-fixer の canon 書込集合に tasks.md を追加する。同期が必要な 4 点をすべて更新する:
   - `spec-fixer.ts` の `writes()` 宣言（permission 層の許可集合を兼ねる）
   - `canon-write-scope.ts` の D5 map
   - TC-019 の期待値（TC-029 drift-guard は 3 点同期で green を維持）
   - spec-fixer prompt の修正対象記述（tasks.md を含める）
2. これにより spec-review の tasks.md への fixable finding が severity 不問で needs-fix → spec-fixer に routing され、pipeline 内で収束する
3. request.md / test-cases.md / attestation への fixable finding は従来どおり escalation とする（境界維持）
4. 「tasks.md は escalation」を期待していた既存テストは新仕様の期待に更新し、更新対象を implementation-notes に列挙する

## スコープ外

- implementer の tasks.md 書込（task checkbox 更新）の変更
- spec-review の verdict 導出ロジックの変更（書込集合から自動追随するため不要）
- request.md / test-cases.md / attestation の書込境界の変更
- spec-review の finding 網羅性

## 受け入れ基準

- [ ] tasks.md への severity medium・resolution fixable の finding で spec-review verdict が needs-fix になり、遷移表で spec-fixer に到達することをテストで固定する
- [ ] request.md / test-cases.md への fixable finding が従来どおり escalation（escalationReason 設定つき）であることをテストで固定する
- [ ] TC-029 drift-guard が writes() / D5 map / 期待値の同期を検証したまま green
- [ ] spec-fixer の prompt（conformance entry / normal entry の両方）が tasks.md を修正対象に含む
- [ ] 期待値を更新した既存テストが implementation-notes に列挙される
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 書込集合の拡張のみで routing を変える。`deriveSpecReviewVerdict` は書込集合から routable / unroutable を導出する設計のため、verdict ロジックに手を入れず宣言の 4 点同期だけで挙動が変わる
- **却下**: tasks.md 専用 fixer の新設 — spec round の fixer は構造的に spec-fixer 一つであり、tasks.md は design step が同時生成する同格の派生成果物。fixer の分割は複雑さだけを増す
- **却下**: 現状維持（tasks.md は escalation）— 転記型 finding のたびに operator 停止と手動適用が続く。実測で canon escalation の最頻要因であり、「request だけで自律収束する」契約に反する
