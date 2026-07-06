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
| 1 | LOW | Scenario coverage | spec.md | `failed` / `terminated` の次アクション（`job resume <slug>`）は次アクション表に定義されているが、個別の Given/When/Then シナリオが存在しない。rules.md は「各 Requirement は少なくとも 1 つの Scenario を含むこと」を要求しており、本 Requirement は 4 シナリオを持つため違反ではないが、テスト起票時に fixture 不足が発生するリスクがある。tasks.md T-01 の受け入れ基準に `failed / terminated` fixture が明記されているため実装レベルでは担保される。 | 対応任意。`failed` / `terminated` の Scenario を spec.md の次アクション Requirement に追加すると仕様の自己完結性が高まる。tasks.md 修正は不要。 |
| 2 | LOW | Scenario coverage | spec.md | `canceled` ステータスは `terminal` 区分の構成ステータスとして定義されているが、`--all` シナリオで言及されるのは `archived` のみ（"the archived job under the 終了済み section"）。`canceled` が `--all` で正しく `終了済み` 区分に表示されることを保証するシナリオがない。 | 対応任意。`canceled` job が `--all` で `終了済み` 区分に現れることを確認するシナリオを追加するか、既存シナリオの Given に `canceled` を加える。または tasks.md T-01 の fixture に `canceled` を追加して補完する（現在は `archived` のみ列挙）。 |
| 3 | LOW | Specification gap | spec.md | `job ls --json` が 0 件フィルタ結果のとき `{ "categories": [] }` を返すことが tasks.md T-04 に明記されているが、spec.md の JSON 要件にシナリオが存在しない。"categories SHALL contain only non-empty categories" から `[]` は論理的に導けるが、実装者が明示的に参照できる規範記述がない。 | 対応任意。JSON Requirement に「フィルタ結果が 0 件のとき stdout は `{"categories":[]}` である」シナリオを追加する。tasks.md の記述で実用上は十分。 |

## Review Notes

### 整合性検証

**spec.md ↔ design.md ↔ tasks.md の一貫性**

- `JobCategoryId` の値（`awaiting-response` / `terminal` 等）は 3 ファイル間で一致している。
- 次アクション写像（running+stale → `job resume <slug>` など 9 エントリ）は spec.md の表と tasks.md T-01 の実装指示で完全一致。
- escalation 発生元の導出ロジック（`endedAt` 最大の verdict="escalation" StepRun の step 名）は spec.md D3・design.md D3・tasks.md T-01 で一致。
- `--json` top-level キー `{ "categories" }` は spec.md・design.md D7・tasks.md T-03 で一致。

**ソースコードとの整合**

- `JobStatus` 7 値（`running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled`、`src/state/schema.ts:5`）はすべて spec.md の区分表に写像されており、全域写像の要件を満たす。
- `ACTIVE_STATUSES`（`running | awaiting-resume`、`lifecycle.ts:48`）と `--active` フィルタの意味が spec.md Requirement 5 と一致。
- `failed / terminated → running` の lifecycle 遷移が許可されている（`lifecycle.ts:42-43`）ため、`job resume` を `failed` / `terminated` の next action として提示することに矛盾はない。
- `checkPrMerged` は `awaiting-archive` 専用に呼ぶ既存の rate-limit 配慮（`ps.ts:158-164`）が tasks.md T-04 で明示的に維持されている。
- `formatJobRow` 撤去と `formatAge` / `truncate` / `checkPrMerged` 存続の分離が tasks.md T-04 で明確に指示されており、既存テスト移行リスクが design.md のリスク欄で識別・対処されている。

**セキュリティ観点**

- `job ls` は読み取り専用コマンドであり、認証変更・スキーマ変更を伴わない。
- `nextAction` は表示用文字列（`"job resume <slug>"`）として構築され、自動実行は行わない。slug は `getJobSlug` が状態ファイルから導出する制御済みデータであり、注入リスクはない。
- `--json` 出力は `JSON.stringify` を使用するため JSON injection リスクはない。
- GitHub API 呼び出し（`checkPrMerged`）は PR 番号を state.json（git 管理下）から取得しており、SSRF 攻撃面は変わらない。
- OWASP Top 10 の各項目に対する影響はない（ローカル CLI ツール、認証変更なし、入力値はフィルタ比較のみ）。

### 設計判断の妥当性

D1（純粋関数分離）、D2（全域写像）、D3（最新 escalation 走査）、D4（per-row 次アクション）、D5（merge を promote しない）、D6（BRANCH → NEXT 列置換）、D7（JSON 安定形）はいずれも要件と一致しており、実装上の曖昧さを残していない。`job retry` 不追加・`JobStatus` 不変の architect 判断も spec に反映されている。
