# Cross-boundary invariants review — iteration 4

## Scope and evidence

- `git diff main...HEAD --stat` で 49 files / 5775 insertions / 110 deletionsを確認した。
- `design.md` と `tasks.md` を通読し、remediation の全-site 契約を既存の conformance fixTarget 集約、fixer context 注入、各 fixer の write scope まで追跡した。
- 前周対象の `src/core/step/canon-escalation.ts`、`src/core/step/judge-verdict.ts`、`src/core/step/write-scope.ts`、`src/core/pipeline/findings-ledger.ts` を現在の内容で読み直した。単一 finding について主 file と全 remediation site を effective fixer の scope で検査する前周 F-001 の具体的欠陥は解消済みである。
- `src/core/review-routing.ts` と code-fixer / implementer / spec-fixer の conformance entry を照合し、複数 fixTarget の既存 priority aggregation 境界を確認した。
- PR 上の verification 証跡を正本とし、test / lint / typecheck は重複実行していない。

## Findings

### F-001 — HIGH / fixable — conformance の target 集約後に全 finding を単一 fixer へ渡すため、site 単位の scope 判定と実際の routing が一致しない

- **File**: `src/core/step/judge-verdict.ts:172`
- **Rationale**: iteration 3 の修正は各 finding をその finding 自身の `fixTarget` で検査するが、conformance の実際の routing は `aggregateFixTarget` が複数 target を `spec-fixer > implementer > code-fixer` の優先順位で 1 target に畳み、その target の `getConformanceFixContext` が conformance findings を絞らず全件返す。例えば、(A) `spec.md` のみを site とする `fixTarget: spec-fixer` finding と、(B) `src/**` を site とする `fixTarget: code-fixer` finding は、それぞれの effective fixer では writable なので escalation を通過し、既存 priority により verdict は `needs-fix:spec-fixer` になる。その後 spec-fixer prompt には A と B の両方が入り、新契約の「全 finding / 全 site を同一 iteration で修正」が要求されるが、spec-fixer は `src/**` を宣言 write scope に持たない。operator 裁定の単一-finding 例は直っている一方、同じ不変条件は unchanged の target aggregation 境界ではまだ成立していない。green の既存 mixed-target test は remediation なし fixture で priority だけを固定しているため、この相互作用を検出しない。
- **Remediation**:
  - **Invariant**: conformance が単一 fixer run に渡す全 finding の主 file と全 remediation site は、選択された集約 target fixer の write scope に入らなければならない。
  - **Sites**:
    - `src/core/step/judge-verdict.ts:172`
    - `src/core/step/judge-verdict.ts:178`
    - `src/core/review-routing.ts:155`
    - `src/core/review-routing.ts:199`
    - `src/core/step/spec-fixer.ts:122`
    - `src/core/step/implementer.ts:319`
    - `src/core/step/code-fixer.ts:133`
  - **Approach**: まず既存 priority で run の aggregate target を決め、remediation 付き fixable findings の全件をその aggregate target に対する同じ共有 write-scope predicate で検査してから verdict を確定する。scope 外の site が 1 件でもあれば fail-closed に escalation する（または、複数 fixer を順次 route する明示的な設計へ変更する）。`getConformanceFixContext` が全 findings を渡す現行契約を維持するなら前者が最小修正である。mixed target + remediation のうち、各 target 単独では writable だが aggregate winner では一部が unwritable になるケースを固定する。

## Observations

なし。
