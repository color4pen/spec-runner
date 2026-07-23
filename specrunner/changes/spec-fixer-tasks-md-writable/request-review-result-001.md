# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コード assertion の実地確認

| assertion | 実際のコード | 一致 |
|-----------|-------------|------|
| `spec-fixer.ts:99-105` — `writes()` は `{design.md, spec.md}` のみ | 確認: lines 99-105 に `[design.md, spec.md]` を返す `writes()` が存在する | ✅ |
| `canon-write-scope.ts:45-52` — D5 map の spec-fixer entry は `{spec.md, design.md}` | 確認: line 51 に `["spec-fixer", new Set([spec.md, design.md])]` | ✅ |
| `canon-write-scope.test.ts` TC-019 — spec-fixer writable = `{spec.md, design.md}` | 確認: lines 146-178 に TC-019 が存在し、tasks.md が含まれないことを assert | ✅ |
| `canon-write-scope.test.ts` TC-029 drift-guard — map と `writes() ∩ protectedCanonPaths` の一致を検証 | 確認: lines 233-295 に TC-029 が存在し、spec-fixer の drift-guard を含む | ✅ |
| `judge-verdict.ts` — `deriveSpecReviewVerdict` が書込集合から routable/unroutable を導出 | 確認: lines 84-106 に `deriveSpecReviewVerdict` が存在し、`canonScope` + `specReviewEffectiveFixer` を使って routing | ✅ |
| `spec-fixer.ts:135` — conformance entry prompt が "fix the spec.md or design.md artifact" と 2 file に限定 | 確認: line 135 に `fix the spec.md or design.md artifact` | ✅ |
| `spec-review-fixer-routing.test.ts` TC-013 — tasks.md への fixable finding が escalation を期待 | 確認: lines 921-936 に TC-013 が存在し、tasks.md → `"escalation"` を期待 | ✅ |
| `judge-verdict.ts:100-119` — conformance routing が `conformanceEffectiveFixer` 経由 | 軽微な不一致（後述） | ⚠️ |

### judge-verdict.ts 行番号の不一致（軽微）

request.md は `judge-verdict.ts:100-119` を conformance の `needs-fix:spec-fixer` routing の根拠として挙げているが、実際の行の内容は以下のとおり:

- lines 100-106: `deriveSpecReviewVerdict` の末尾（4b: routable → needs-fix / 5: critical|high → needs-fix）
- lines 108-119: `aggregateFixTarget` 関数

conformance routing の実体（`deriveConformanceVerdict`）は lines 148-167 に存在する。関数は確かに `conformanceEffectiveFixer` を使用しており、書込集合拡張が自動追随するという主張は正確。行番号の記載ミスだが、実装方針の正確性には影響しない。

### system prompt の確認

`src/prompts/spec-fixer-system.ts` line 24 に `write-set: spec.md / design.md` と明示されており、こちらも更新対象。request の要件「spec-fixer prompt（conformance entry / normal entry の両方）が tasks.md を修正対象に含む」は、system prompt の write-set 宣言も対象に含む必要がある（conformance entry の `buildMessage` inline text のみでなく）。

### routing 自動追随の確認

`deriveSpecReviewVerdict`（lines 84-106）は `canonScope.writableByFixer.get("spec-fixer")` から writable set を参照し、`selectUnroutableCanonFindings` / `selectRoutableCanonFindings` で分類する設計のため、D5 map と `writes()` に tasks.md を追加するだけで tasks.md finding の verdict が escalation → needs-fix に変わる。`deriveSpecReviewVerdict` 自体の変更は不要、という設計主張は正しい。

### 同期対象の網羅性確認

request が列挙する 4 同期点:
1. `spec-fixer.ts` `writes()` — 確認済み
2. `canon-write-scope.ts` D5 map — 確認済み
3. TC-019 期待値 — 確認済み
4. spec-fixer prompt — conformance entry (line 135) + system prompt (line 24) の両方が必要

TC-029 drift-guard は「3 点同期で green を維持」と記載されているが、drift-guard は `writes() ∩ canonPaths` と D5 map の一致のみを機械検証する。TC-019 は別 assert として存在するため、4 点すべての一致が TC-029 緑 + TC-019 更新の組み合わせで担保される設計。整合している。

### 境界維持の確認

`makeCanonScope()` fixtures（TC fixture）において tasks.md は canonPaths に含まれているが spec-fixer writable には含まれない設計になっており、本変更後は writable に含まれることで needs-fix に変わる。request.md と test-cases.md については:
- request.md: `requestMdPath(slug)` が canonPaths に含まれており、spec-fixer writable には追加されない（境界維持）
- test-cases.md: canonPaths に含まれており、spec-fixer writable には追加されない（境界維持）

これらは変更後も escalation のままとなることを TC-013 の修正後テストで固定できる。

## 検証できなかった項目

None

## Findings 詳細

None（blocking finding なし）

`judge-verdict.ts` 行番号不一致は実装に影響を与えないため finding として記録しない。system prompt が update 対象として必要な点は request の要件「spec-fixer prompt（conformance entry / normal entry の両方）が tasks.md を修正対象に含む」に吸収される。
