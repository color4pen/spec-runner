# Cross-Boundary Invariants Review: conformance-canon-tiers

**Reviewer**: cross-boundary-invariants
**Iteration**: 1

## 検証した項目

### 1. 機械層の不変条件（verdict 導出・fixTarget 集約・canon-escalation）

対象ファイル:
- `src/core/step/judge-verdict.ts` — `deriveConformanceVerdict` / `aggregateFixTarget`
- `src/core/step/canon-escalation.ts` — `conformanceEffectiveFixer` / `selectUnroutableCanonFindings`
- `src/core/step/canon-write-scope.ts` — writableByFixer マップ

**判定**: 完全に無変更。機械層の不変条件は保持されている。

---

### 2. `CONFORMANCE_REPORT_TOOL` zodSchema と fixTarget enum の不変条件

`conformanceFindingSchema.fixTarget` の enum 値（`implementer` / `code-fixer` / `spec-fixer`）と zod スキーマは変更なし。TC-CONF-01 / TC-CONF-03 / TC-JVCONF-01〜09 が無変更で green であることをテスト実行で確認済み。

**判定**: 機械意味論の不変条件は保持されている。

---

### 3. `getConformanceFixContext` の呼び出し側（spec-fixer / implementer / code-fixer）

`getConformanceFixContext` は `needs-fix:<target>` という verdict prefix に依存する。新システムでも conformance は同形式の verdict を返す（verdict 導出関数が無変更）。

spec-fixer (`spec-fixer.ts:87,112`) / implementer (`implementer.ts:163,202`) / code-fixer (`code-fixer.ts:84,124`) が参照する `getConformanceFixContext` の動作は変わらない。

**判定**: 境界をまたぐ呼び出し側の不変条件は保持されている。

---

### 4. spec-observation.ts の conformance-triggered entry 検出（`specFixerForwardsToTestGen`）

`specFixerForwardsToTestGen` は `getConformanceFixContext(state, SPEC_FIXER) !== null` を条件とする。この関数は conformance verdict が `needs-fix:spec-fixer` の場合のみ非 null を返す。新システムでも conformance は request/spec 違反を伴う場合に `spec-fixer` finding を出せるため、この経路は正常に動作する。

**判定**: 不変条件は保持されている。

---

### 5. canon-write-scope と fixTarget routing の交差境界

`protectedCanonPaths` に含まれる `request.md` は、`writableByFixer.get("spec-fixer")` に含まれない（spec-fixer の write-set は `{spec.md, design.md, tasks.md}`）。

新 conformance prompt の Method 節には「finding の根拠には request.md / spec.md の該当箇所を引く（design/tasks 自体は根拠にしない）」という指示がある。この日本語の「根拠に引く」は `rationale` フィールドへの引用を意味し、`file` フィールドの設定ではない。routing 表は「根源が spec.md または design.md の誤りにある → spec-fixer」と明示しており、agent は `file = spec.md` か `file = design.md` を指定するはずで、いずれも spec-fixer の write-set に含まれる（routable）。

**潜在リスク（低）**: 上記指示を誤読して `file = request.md, fixTarget = spec-fixer` と設定した場合、canon-escalation システムが UNROUTABLE CANON FINDING と判定し escalation する。ただし:
- routing 表が「根源が spec.md / design.md → spec-fixer」と明示し、`file` の自然な解釈を誘導している
- spec.md / design.md はどちらも routable

**判定**: 機械層の不変条件自体は保持されている。prompt の表現が agent の誤解を招く可能性はあるが、routing 表が補正情報を提供している。

---

### 6. JSDoc コメントと実際の description の乖離

`src/core/step/report-tool.ts` の lines 172-175 に以下の JSDoc が残っている:

```
"spec-fixer"  — spec/design errors: the spec or design artifact is wrong/incomplete
"implementer" — implementation gaps: the implementation is missing or incomplete
"code-fixer"  — local code non-conformities: isolated code-level issues
```

一方、実際の tool description は「Findings are raised only when request.md / spec.md normative requirements are violated」という新制約を含んでいる。JSDoc は旧セマンティクスのまま更新されていない。

機械挙動への影響はないが、将来の開発者が JSDoc を参照した場合に旧挙動と新制約の違いを誤解するリスクがある。

---

### 7. `conformanceApprovedForVerifiedRevision` の不変条件（再検証チョークポイント）

この関数は `verdict === "approved"` と commitOid の一致のみを見る。新システムで conformance が approve するケースが増えても（design/tasks 乖離が finding にならなくなるため）、commitOid ベースの再検証チョークポイントは正しく機能する。

**判定**: 不変条件は保持されている。

---

### 8. `reads()` と IoRef の完全性

`ConformanceStep.reads()` は tasks.md / design.md / spec.md / request.md の 4 ファイルを引き続き返す。agent は計画ファイル（design.md / tasks.md）を plan context として読む必要があるため、IoRef リストの維持は正しい。

**判定**: 不変条件は保持されている。

---

### 9. テスト実行結果

```
bun run typecheck  → green (TypeScript errors: 0)
bun run test       → 764 test files passed, 11446 tests passed (1 skipped)
```

既存テスト（TC-012 / TC-CONF-01〜03 / drift-guard / TC-JVCONF-01〜09）が無変更で green であることを確認した。

---

## Findings 詳細

### F-001: JSDoc comment が report-tool.ts に旧セマンティクスで残存

**ファイル**: `src/core/step/report-tool.ts` L172-175  
**severity**: low  
**resolution**: fixable

`CONFORMANCE_REPORT_TOOL` の JSDoc コメントが旧 fixTarget セマンティクス（`"spec-fixer" — spec/design errors: the spec or design artifact is wrong/incomplete`）のまま更新されていない。実際の description には「Findings are raised only when request.md / spec.md normative requirements are violated」という新制約が追加されているが、JSDoc にはない。機械挙動への影響はないが、コード読者が JSDoc から旧挙動を前提として理解するリスクがある。

---

## non-blocking note

**routing 表と rationale 指示の語義の補完関係**: Method 節の「finding の根拠には request.md / spec.md の該当箇所を引く」という指示は `rationale` フィールドへの引用を意図している。ただし、この指示単独では `file` フィールドに request.md を設定すると読める余地がある（その場合 `file = request.md, fixTarget = spec-fixer` → escalation となる）。routing 表の「根源が spec.md または design.md → spec-fixer」という記述が補完情報として機能しており、実害は軽微と判断する。将来の prompt 改訂では「rationale に request.md / spec.md の該当箇所を引用すること（file フィールドは実際の根源ファイルを指定）」のように明示することで曖昧さを排除できる。

---

## 検証できなかった項目

None

---

## Evidence

- checked: 9
- skipped: 0
- unverified: 0
