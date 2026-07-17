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
| 1 | LOW | Clarity | 要件 4 — runtime 供給手段 | "inject するか、cwd から構築" の二択を残しているが、T1〜T6 のテストは fake runtime を注入する必要があるため injection が実質必須。実装者が cwd 構築を選んだ場合、テスト可能性が損なわれるリスクがある。 | 実装者向けのガイダンスとして「テスト可能性のため `runMergeThenArchive` に `runtimeStrategy?: RuntimeStrategy` 注入を推奨」と添えると迷いが減る。機能正確性には影響しない。 |
| 2 | LOW | Clarity | 要件 1 — `specReview` 達成判定 | `state.steps["spec-review"]` の「非空」の定義が曖昧（StepRun 配列が存在するが verdict が error のケースも含むか）。 | 実装者向けに「spec-review の最新 StepRun が approved または needs-fix であれば実行済みとみなす」等、より具体的な条件を明示すると誤実装を防げる。現行コードの読み方から明らかな範囲なので LOW。 |

## Code Assertion Fact-Check

全 code assertion を実際のファイルと照合した。

| Assertion | 結果 |
|-----------|------|
| `merge-then-archive.ts:162` — `jobAssurance` 外スコープ宣言 | ✅ |
| `merge-then-archive.ts:196` — `jobAssurance = getProfile(state).assurance` inside try | ✅ |
| `merge-then-archive.ts:270-271` — `archiveSha = archiveRecordResult.headSha` | ✅ |
| `merge-then-archive.ts:337-411` — Step 3.6 floor gate | ✅ |
| `merge-then-archive.ts:383-384` — `satisfiesFloor(jobAssurance, floor)` | ✅ |
| `merge-then-archive.ts:388-407` — escalation 構造 | ✅ |
| `state/profile.ts:81-110` — `satisfiesFloor` fail-closed | ✅ |
| `state/profile.ts:143` — `getProfile` は `state.profile ?? STANDARD_PROFILE` | ✅ |
| `core/pipeline/types.ts:247` — `strategy-deferred` → VERIFICATION | ✅ |
| `core/runtime/local.ts:831-850` — `listCommitChangedFiles` 実装 | ✅ |
| `core/runtime/local.ts:902-906` — custom commands → `unavailable` | ✅ |
| `core/runtime/managed.ts:599-614` — managed は常に `unavailable` | ✅ |
| `state/schema/types.ts:341-347` — `BiteEvidenceRecord` に OID フィールド無し | ✅ |
| `bite-evidence/gate.ts:26-28` — `isExcludedPath` が `specrunner/changes/`・`.specrunner/` を除外 | ✅ |
| `bite-evidence/gate.ts:117-140` — `listCommitChangedFiles` + `isExcludedPath` filter | ✅ |
| `bite-evidence/oids.ts:27-43` — `resolveBaseCandidateOids` 実装 | ✅ |
| `archive/orchestrator.ts:368-374` — `headSha` from `git rev-parse HEAD` | ✅ |
| `config/schema/types.ts:365-377` — `MinimumAssuranceConfig` interface | ✅ |
| `state/schema/operations.ts:264-292` — `biteEvidence` validation | ✅ |
| `cli/archive.ts:167,227` — `minimumAssurance` を `runMergeThenArchive` に渡す | ✅ |
| `merge-then-archive-floor.test.ts:249-293` — TC-011 が現在 `exitCode 0` を期待 | ✅ |
| `.specrunner/config.json` — custom `verification.commands` あり、`minimumAssurance` 未設定 | ✅ |
| port: 二 OID diff primitive が現状存在しない | ✅ |

## 評価サマリ

**問題の正確性**: P0 として立てた「宣言 vs 達成の乖離」は実コードで確認済み。`getProfile(state).assurance` は宣言 profile を返し、profile 欠落なら STANDARD_PROFILE（最強宣言）に fallback するため、evidence を一切生成していない job が floor を素通りする。TC-011 がこれを明示的に凍結している（exitCode 0 期待）。

**解法の妥当性**: 既存 `satisfiesFloor` は変更せず、渡す assurance を「宣言」から「達成」に差し替えるアプローチは最小変更で正しい。`archiveSha` は既存 Step 3 の出力として確実に入手可能。fail-closed の各辺（OID 欠落 / unavailable / 凍結破れ / base-green）が要件に列挙されており、T1〜T6 のテストで網羅される。

**受け入れ基準の充足性**: T1（anti-regression）、T2（TC-011 反転）、T3（達成で通す）、T4（凍結の歯）、T5（空洞の歯）、T6（各 fail-closed ケース）、T7（schema round-trip）、T8（回帰保存）はいずれも機械テストで検証可能な条件で記述されている。

**LOW 指摘 2 件は非ブロッキング**。設計の整合性、受け入れ基準の完全性、コードアサーションの正確性に問題なし。
