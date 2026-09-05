# Cross-boundary invariants review — iteration 005

## Scope and method

- `git diff main...HEAD --stat` で変更範囲を確認した。
- `design.md` と `tasks.md` を読み、remediation contract、legacy compatibility、fail-closed、fixer routing、ledger identity の設計上の不変条件を実装と照合した。
- iteration 004 の finding と operator 裁定を起点に、`canon-escalation.ts`、`canon-write-scope.ts`、`write-scope.ts`、`judge-verdict.ts`、`findings-ledger.ts`、`spec-fixer.ts`、`review-routing.ts`、`step-completion.ts` および追加テストを再確認した。
- PR 上の `verification-result.md` を検証証跡の正本とし、test / lint / typecheck は重複実行していない。

## Evidence

### Aggregated fixer routing

`isFindingWithinFixerWriteScope` は primary `finding.file` と `remediation.sites` の全 path を検査する。canon path は effective fixer の `writableByFixer`、非 canon path は `broadWriteFixers` に照合される。`selectUnroutableCanonFindings` と `selectRoutableCanonFindings` は remediation 付き finding についてこの predicate の否定／肯定を使うため補集合になっている。

`deriveConformanceVerdict` は finding 個別の `fixTarget` による検査に加え、`aggregateFixTarget` の決定後に、実際に全 findings を受け取る単一 fixer を resolver として再検査する。これにより、主 site が spec canon、副 site が `src/**` で aggregated target が spec-fixer になるケースは fixer 起動前に escalation となり、前回指摘した「site 単位 scope 判定と実 routing の不一致」は解消されている。

### Write-scope source alignment

`buildCanonWriteScope` の canon write set は各 fixer の宣言 ownership に対応し、非 canon の broad write capability は `write-scope.ts` の guarded-write step 集合に由来する `BROAD_WRITE_FIXERS` から構築される。code-fixer / implementer は guarded enforcement の下で非 canon path を扱え、spec-fixer は宣言された change-folder canon のみに限定される。この分類は commit-time の guarded/scoped 境界と矛盾しない。

### Downstream consumers and legacy behavior

reviewer-chain ledger、parallel fixer aggregation、spec-review ledger は同じ unroutable selector を用いて、fixer に渡せない finding を除外する。step completion の escalation reason も verdict derivation 時に捕捉した同じ resolver を再利用する。

remediation のない persisted finding は従来どおり primary canon path のみで分類され、非 canon legacy finding は pass-through のままである。fingerprint / ledgerRef の identity に remediation は加えられていない。

### Targeted regression coverage

追加テストでは、spec-fixer に対する spec canon + `src/**` site、非 canon primary + protected canon secondary、全 site writable、legacy finding、code-fixer の non-canon broad write、および conformance の集約後 target 再検査が固定されている。

## Findings

該当なし。

## Observations

該当なし。
