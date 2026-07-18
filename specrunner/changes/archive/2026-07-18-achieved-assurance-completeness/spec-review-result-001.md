# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Completeness | spec.md | Requirement 2（二層凍結）の正パスシナリオが未定義。blob freeze + scenario freeze intact で `testDerivation:"frozen"` になる条件の肯定シナリオが spec.md に記載されていない。失敗ケースのみ明示。design.md control flow と T2 で補完されるため実装ブロックにはならない。 | spec.md Requirement 2 に "Scenario: blob freeze かつ scenario freeze intact" を追加して testDerivation:"frozen" の肯定条件を明示するとより完全になる。任意。 |
| 2 | LOW | Clarity | design.md | D5 の suffix 解決規則に slug 衝突の注釈なし。slug `foo` と `bar-foo` が archive に同居する場合、suffix `foo/events.jsonl` が `bar-foo/events.jsonl` にも `-foo/events.jsonl` で一致し複数一致になる。設計は「複数一致→unavailable（fail-closed）」で対処済みだが、理由が record されていない。 | design.md D5 の「複数一致は unavailable」に「slug が別 slug の suffix になる場合も含む、fail-closed で安全側」の一文を追加するとリスク評価が自己完結する。任意。 |

## 評価

### コード前提の照合

request-review-attestation.json でコードアサーションが網羅検証済み。本レビューでは追加確認として以下を実コードで照合した。

| 確認項目 | 結果 |
|---|---|
| `fold(content: string): FoldResult` の `FoldResult.lineage: LineageRecord[]` export（event-journal.ts:136,157,193） | ✓ |
| `StepRun.outcome.verdict: Verdict\|string\|null`（types.ts:122-123） | ✓ |
| `archive-change-folder.ts` が `git mv specrunner/changes/<slug> specrunner/changes/archive/<YYYY-MM-DD>-<slug>` を実行（L52） | ✓ |
| floor gate（Step 3.6、merge-then-archive.ts:357-443）が CI-wait（Step 4:456〜）より前に実行される | ✓ |
| `FORWARD_TYPES` が `gate.ts:23` で未 export のまま（P0-3 gap 確認） | ✓ |
| `satisfiesFloor` が absent（undefined）フィールドを false に倒す（profile.ts:81-110） | ✓ |
| `checkpoint-ref.ts:152-176` が `git ls-tree` + `git show` を spawnFn array 形式で呼び出す（injection なし） | ✓ |
| `RealRuntimeStrategy` intersection に `runTestsAtCommit` required 追加済み（runtime-strategy.ts:669-690） | ✓ |
| `digestArtifacts` が `crypto.createHash("sha256").update(content).digest("hex")` で `"sha256:"+hex` を返す（local.ts:1044-1056） | ✓ |

### 要件整合性

**P0-1 (HEAD-green)**: 現行 `achieved-assurance.ts:217-241` は `runTestsAtCommit(baseOid, ...)` のみ実行し `finalHeadOid` でテストを実行しない。spec.md Requirement 1 / design.md D1 / tasks.md T-05 が一貫して「`runTestsAtCommit(finalHeadOid, ...)` を実行し全件 `passed===true` かつ欠落なし」を要求している。base-red と対称の完全被覆ロジック（passedByFile map + notGreen filter）の記述が design.md step 8 と tasks.md T-05 に揃っており、実装者が迷う余地はない。

**P0-2 (scenario 二層凍結)**: 現行は materialized blob の freeze（`diffPathsBetweenCommits`）しか確認せず、`events.jsonl` lineage の frozen hash と `test-cases.md@finalHeadOid` の hash 一致を見ない。spec.md Requirement 2 の (a)(b)(c) 三条件、design.md D2 の制御フロー（steps 5-7）、tasks.md T-04 の実装ステップが一致している。`readFileAtCommit` → `fold` → 最新 test-case-gen の `endsWith("test-cases.md")` hash 抽出規則が tamper.ts と同一規則に揃えると明記されており単一 source 原則を守っている。

**P0-3 (type↔strategy)**: spec.md Requirement 3 / design.md D3 / tasks.md T-03 が一致。`FORWARD_TYPES` を `gate.ts` から export して archive が再利用するという単一 source 設計が正確に記述されている。`testDerivation` / `specReview` は type gate 対象外であることが spec.md にも明記されており、実装境界が明快。

**P1 (spec-review approved)**: 現行 L96-99 は `Array.isArray(specReviewRuns) && specReviewRuns.length > 0` のみ確認。spec.md Requirement 4 / design.md D4 / tasks.md T-03 が `.at(-1)?.outcome?.verdict === "approved"` を要求。`deriveJudgeVerdict` が成功時に `"approved"` を返すことは judge-verdict.ts:39 で確認済み。整合。

**新 runtime primitive (D5)**: `RealRuntimeStrategy` intersection への required 追加、`AssuranceProvenanceRuntime` Pick への追加、method check への追加、`ls-tree` suffix 解決ロジック、managed unavailable、の五点が design.md D5 / tasks.md T-01 に一貫して記述されている。T7 の round-trip hash 一致テスト（`digestArtifacts` vs `readFileAtCommit` 由来の hash）が EOL/smudge リスクを歯化する設計は妥当。

### セキュリティ評価

- **コマンドインジェクション**: `git show <oid>:<path>` / `git ls-tree -r <oid>` は spawn を array 形式で呼び出す（checkpoint-ref.ts の雛形と同様）。`finalHeadOid` はシステム生成の archive commit SHA、`pathSuffix` は `state.request.slug`（システム生成の kebab-case 文字列）。シェル補間なし。リスクなし。
- **git オブジェクトストア内のパストラバーサル**: git show の path 解決は git object tree 内に閉じる。`../` 等の traversal がスラッグに混入しても git の tree ルックアップで無害化される。なお slug は外部ユーザー入力でなくシステム生成。リスクなし。
- **複数一致による fail-open**: suffix が複数 tree entry に一致する場合 `unavailable`（fail-closed）。安全側。
- **情報漏洩**: `readFileAtCommit` はジョブ自身の `events.jsonl` / `test-cases.md` のみを slug で絞って読む。ジョブ間の情報流出はない。
- **events.jsonl の大きなファイルによる DoS**: 既存の pipeline が events.jsonl を fold する実績がある範囲内。新規リスクなし。

### テスト網羅性

T1〜T8 の各テストが固定する歯と破壊確認（T1/T3）の要件が明確。歯の命名（named teeth）が acceptance criteria と tasks に対応しており、pipeline による機械検証が可能。backward-compat 監査（T-09）で全 caller の洗い出しを明示しており、retrofit 漏れのリスクが管理されている。

### 全体判断

4 点の ADR 不整合はすべて実コードで確認済み（request-review-attestation）。spec.md / design.md / tasks.md の三文書が一貫していて実装者が判断を要する分岐は残っていない。Non-Goals は ADR 根拠付きで明記されており scope 膨張のリスクがない。LOW 所見 2 件はいずれも optional な補強であり実装をブロックしない。
