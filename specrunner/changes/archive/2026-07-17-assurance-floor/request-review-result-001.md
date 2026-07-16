# Request Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approve | needs-discussion | reject
  - approve:          No blocking findings (no HIGH, no decision-needed). Request is ready for pipeline execution.
  - needs-discussion: One or more blocking findings (HIGH or decision-needed) resolvable through discussion.
  - reject:           Multiple blocking findings AND requirement contradictions or structural breakdown.
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | Location | Description | Recommendation
- Valid Severity values (uppercase): HIGH | MEDIUM | LOW
  - HIGH:   Request-level defect — goal unclear, acceptance criteria absent/untestable, or critical external constraint unspecified
  - MEDIUM: Scope ambiguity, recommended additions
  - LOW:    Clarity improvements, expression refinements
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | MEDIUM | Scope ambiguity | 要件1 + 要件3 / satisfiesFloor | `satisfiesFloor(assurance, floor)` が R1 形式（assurance: {}）を受け取った場合の挙動が未定義。R1 job（assurance: {}あり）を R2 デプロイ後に archive すると archive gate が呼ばれる可能性があるが、undefined フィールドを格子上でどう扱うかは仕様に明記されていない。なお verify-checkpoint の backward compat は正しく成立する（stored assurance {} で computePolicyDigest を回すため digest 不変）。 | `satisfiesFloor` の spec に「assurance フィールドが absent（{}形式の古いプロファイル）の場合は最弱値として扱う」か「STANDARD_PROFILE とみなす」か、どちらかを実装メモとして request.md に補記するか、test-case-gen フェーズで fixture を通じて固定すること。いずれも設計を変えずに解消できるため blocking ではない。 |

## Code Assertion Fact-Check

全アサーションを実コードで照合した。

| 主張 | ファイル:行 | 結果 |
|------|------------|------|
| `ProfileAssurance = Readonly<Record<string,unknown>>` (opaque) | `src/state/schema/types.ts:275` | ✓ 一致 |
| `STANDARD_PROFILE.assurance = {}` | `src/state/profile.ts:44-45` | ✓ 一致 |
| `computePolicyDigest` が assurance を含めて hash | `src/state/profile.ts:29-36` | ✓ 一致 |
| `getProfile(state)` = absent→STANDARD | `src/state/profile.ts:65-67` | ✓ 一致 |
| `evaluateProtectedPaths` が protected-paths.ts に存在 | `src/core/archive/protected-paths.ts` | ✓ 一致 |
| protected-paths gate: `formatEscalation` + exitCode 1 (fail-closed) | `src/core/archive/merge-then-archive.ts:262-321` | ✓ 一致 |
| `ArchiveConfig.protectedPaths?: string[]` | `src/config/schema/types.ts:308-334` | ✓ 一致 |
| archive CLI が `loadConfig()` で main config を読む（out-of-loop） | `src/cli/archive.ts:153` | ✓ 一致 |
| archive CLI が `protectedPaths` を `runMergeThenArchive` に渡す | `src/cli/archive.ts:165, 210-227` | ✓ 一致 |
| archive Step 1 で job state をロード（profile はその中に） | `src/core/archive/merge-then-archive.ts:153-186` | ✓ 一致 |

## 評価まとめ

- **要件の明確さ**: 高い。4 要件が具体的に記述され、実装に直結する。
- **受け入れ基準の検証可能性**: 高い。テスト fixture の具体的な scenario が列挙されている。
- **コードアサーションの正確性**: 全項目が実コードと一致。archive gate は `merge-then-archive.ts` Step 3.5 に既存し、そこへの追加は整合する。
- **backward compat 主張**: verify-checkpoint の backward compat は `computePolicyDigest(stored_profile)` が stored assurance を使うため正しく成立する。ただし archive gate での R1 jobs 挙動は Finding #1 のとおり未明示。
- **スコープ**: 明確に R6 を除外し、archive gate 1 点に絞っている。
