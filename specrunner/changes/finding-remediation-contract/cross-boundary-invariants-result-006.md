# Cross-boundary invariants review — iteration 006

## Scope and method

- `git diff main...HEAD --stat` で 65 files / 8099 insertions / 120 deletionsの変更範囲を確認した。
- `design.md` と `tasks.md` を読み、remediation contract、fail-closed、全-site fixer routing、ledger identity / merge の設計要求を実装と照合した。
- iteration 005 以降の差分を確認した。実行時コードの変更はなく、`src/prompts/__tests__/fragment-coverage.test.ts` と `src/core/step/__tests__/regression-gate-step.test.ts` に契約テストが追加されている。
- 前周までの境界確認を免除せず、`canon-escalation.ts`、`canon-write-scope.ts`、`write-scope.ts`、`judge-verdict.ts`、`findings-ledger.ts`、`executor.ts`、`no-op-detect.ts`、`routed-findings.ts`、`regression-gate.ts` を現在の内容で再確認した。
- PR 上の `verification-result.md` を検証証跡の正本とし、test / lint / typecheck は重複実行していない。

## Evidence

### Routing and write-scope invariants

remediation 付き finding は、primary file と全 `remediation.sites` が共有 predicate `isFindingWithinFixerWriteScope` で検査される。canon path は fixer ごとの明示 write set、非 canon path は guarded-write fixer 集合に照合される。routable / unroutable selector はこの predicate の肯定・否定を使い、spec-review、judge/custom-reviewer、conformance の各経路で同じ分類が使われている。

conformance は個別 `fixTarget` の検査に加え、既存 priority で target を集約した後、実際に全 findings を受け取る単一 fixer に対して全件を再検査する。したがって mixed target の各 finding が単独では合法でも、集約 fixer が一部 site を書けない組合せは fixer 起動前に escalation となる。

### Ledger and regression-gate invariants

ledger の identity は従来どおり `file|line|title` で、`ledgerRef` の算出も変更されていない。同一 identity の重複 finding は、代表 entry の従来フィールドを維持しながら remediation sites を到着順の和集合として統合するため、後続 iteration や並列 reviewer が追加した site を regression-gate が失わない。

regression-gate message は remediation の invariant と全 sites を展開し、全 site 検証を要求する。iteration 005 以降に追加されたテストは、この user message 側の指令と system prompt 側の全-site検証・remediation 継承指令の双方を固定しており、実行時経路に新しい分岐や状態遷移は導入していない。

### No-op and legacy invariants

code-fixer の no-op 判定には routed finding の primary file と全 remediation sites が渡され、pipeline-managed path の exemption cap は維持されている。change-folder 内の正当な副 site だけを修正した run も実作業として数えられる一方、state / events / usage 等の pipeline 自動更新だけでは no-op を回避できない。

remediation のない persisted finding は legacy 分岐で従来どおり primary canon path のみを分類し、非 canon finding は pass-through のままである。新しい prompt/test 契約は persisted state の再読込、verdict identity、Git / PR profile の前提を変更していない。

## Findings

該当なし。

## Observations

該当なし。
