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
| 1 | LOW | Implementation Hint | tasks.md | T-08 の sub-floor fixture で `policyDigest:"sha256:..."` をプレースホルダとして記載しているが、archive gate は policyDigest を検証しないため任意値で問題ない。ただし混乱を招く可能性がある。 | コメントに "policyDigest はどんな値でもよい（gate は self-consistency を検証しない）" と注釈を加える。実装上は問題なし。 |
| 2 | LOW | Implementation Hint | tasks.md | T-06 で `satisfiesFloor` に渡す floor は「level フィールドを取り出したもの」と明記しているが、`MinimumAssuranceConfig` は `AssuranceFloor` を extends するため `minimumAssurance` をそのまま渡しても型的に正しく動く。どちらの実装でも可。 | 実装者向けに注記は不要（型が許容する範囲）。現記述で問題なし。 |

## Review Notes

### 検証したコード参照

すべての spec 内コード参照を実際のファイルと照合した。

| 参照 | 実コード確認 |
|------|-------------|
| `ProfileAssurance = Readonly<Record<string,unknown>>` at `types.ts:275` | ✓ 確認済 |
| `STANDARD_PROFILE.assurance = {}` at `profile.ts:45` | ✓ 確認済 |
| `computePolicyDigest` body-only hash at `profile.ts:28-37` | ✓ 確認済 |
| `evaluateProtectedPaths` truncated fail-closed at `protected-paths.ts` | ✓ 確認済 |
| Step 3.5 at `merge-then-archive.ts:262-321` | ✓ 確認済 |
| `ArchiveConfig` at `config/schema/types.ts:308` | ✓ 確認済 |
| `loadConfig` / `config.archive?.protectedPaths` at `cli/archive.ts:152-175` | ✓ 確認済 |
| `runMergeThenArchive` call at `cli/archive.ts:210-227` | ✓ 確認済 |
| `verify-checkpoint` が self-consistency のみ検証（TC-VC-015〜018 確認）| ✓ 確認済 |
| 既存テスト `assurance: {}` / `assurance: { level: "high" }` の literal使用 | ✓ 確認済 |

### セキュリティ評価

**A01 (Broken Access Control)**

floor 評価は `src/cli/archive.ts` が `loadConfig()` を読む main セッションで実行される。worktree（agent の書込み面）から config を読まないため、agent は floor 設定を書き換えられない。`getProfile(state).assurance` は branch-borne な state.json から読まれ、profile フィールドは型で immutable（`readonly`）かつ pipeline ステップが更新しないため改竄不可。

**A03 (Injection)**

glob パターンは zod で `string().check(minLength(1))` バリデーション済み。`evaluateProtectedPaths` の glob マッチングは既存コードの再利用。level フィールドは union literal に制限されており入力注入の余地はない。

**Fail-closed 強度**

- truncated（GitHub API 3000 ファイル上限）→ block（既存 Step 3.5 と同型）
- assurance フィールド欠落 / 未知値 → `satisfiesFloor` が `false`（fail-closed）
- `minimumAssurance` 設定なし → gate 全体が無効（後方互換）

### 後方互換性

`verify-checkpoint` の digest 検証は `computePolicyDigest(stored) === stored.policyDigest` のみを確認し、STANDARD_PROFILE 定数との一致を見ない。assurance 定数値変更後も `assurance: {}` を持つ R1 checkpoint は自身の body に対して自己整合を保ち、attach を通過する。TC-VC-015〜018 で確認済みの検証ロジックが保証する。

`ProfileAssurance` の widening（index signature 保持 + optional typed fields）により、既存テストの `assurance: {}` および `assurance: { level: "high" }` literal は `ProfileAssurance` に代入可能のまま保たれる。

### 設計判断の妥当性

D1（widening）・D2（lattice + fail-closed on unknown）・D3（STANDARD_PROFILE 最強値 + load 時再計算）・D4（独立 Step 3.6 ブロック）・D5（`ArchiveConfig` 配下配置）はいずれも代替案検討済みで適切に却下されており、判断の根拠が明確。

### スコープ適合性

R2 時点では実運用の全 job が STANDARD_PROFILE（最強 assurance）を持つため、floor gate が誤って実 job を止めることはない。sub-floor profile は test fixture のみに登場させる制約が spec/tasks 双方に明記されており、R6（profile 選択機構）との境界が明確。
