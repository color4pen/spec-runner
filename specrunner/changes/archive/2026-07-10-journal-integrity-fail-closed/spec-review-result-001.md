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
| 1 | LOW | Security | tasks.md T-02 / T-05 | `FoldCorruption.snippet`（最大 ~120 文字）が `describeJournalIssue()` を経由してターミナル出力に流れる。現状 events.jsonl は SpecRunner 自身が書くため ANSI エスケープ注入リスクは小さい。しかし lineage record 等に将来エージェント出力が埋め込まれると corrupt 行経由でエスケープコードが端末に渡る経路ができる。 | 現時点は必須対応なし。将来 `describeJournalIssue` 側で非印刷文字を strip するか、snippet を JSON エスケープ表示する設計余地を残しておくこと。 |
| 2 | LOW | Correctness | tasks.md T-04 | `persist()` の fast path（stored counters ≥ in-memory events のとき fold を省略する経路）は今回変更しない設計。events.jsonl が load() 後に外部から破損されると、その直後の fast path persist() は corruption を検出せずに state.json の cursor 書き換えのみ行い、次に fold 経路に入る persist() まで検出が遅れる。設計では「fast path は新規 event を append しないため破損を導入しない」と rationale があり、doctor でカバーする方針。 | design.md D5 Risks/Trade-offs に本シナリオを明記するか、T-04 に「fast path で corruption 未検出は意図的」と一行追記することを推奨（現状 design.md の「fast path は変更しない」で暗示されているが、テスト担当者が誤解しないよう明示するとよい）。実装上は変更不要。 |
| 3 | LOW | Consistency | spec.md / tasks.md T-07 | `FoldCorruption.lineIndex` は「committed lines 内の 0-origin インデックス」と定義されており、実ファイルの行番号とは異なる。`describeJournalIssue` が "corrupt record at line N" と出力すると、ファイル内実行数とずれた番号がユーザーに伝わる可能性がある。snippet フィールドが補完するため診断は可能だが、メッセージが「ファイルの N 行目」と誤解されやすい。 | T-02 の `describeJournalIssue` の例示メッセージで "line N" の N が "committed lines 内インデックス" であることを明確化するか（例: "committed record #N"）、もしくは実装時に snippet を優先して lineIndex を補助情報扱いにすること。仕様変更は不要。 |

## Review Notes

### Requirements → Spec coverage（全件 OK）

| 要件 | design.md | spec.md シナリオ | tasks.md |
|------|-----------|-----------------|----------|
| 1. fold が末尾 partial と中間破損を区別して報告 | D1 / D2 | fold 5 シナリオ | T-01 |
| 2. load / persist が中間破損で fail-closed | D4 / D5 | load/persist 3 シナリオ | T-03 / T-04 |
| 3. persist が counter 逆行で fail-closed（max() 廃止） | D3 / D5 | truncation 2 シナリオ | T-02 / T-04 |
| 4. job show が破損で crash せず明示 | D6 | job show 2 シナリオ | T-05 |
| 5. doctor が journal integrity チェックを持つ | D7 | doctor 2 シナリオ | T-06 |
| 6. 誤検出防止（空 / 末尾 partial / 未知 type） | D1 / D2 | 3 シナリオ（unknown type, partial-only, empty） | T-01 / T-07 |

### Design decisions の整合性確認

- **D1（fold throw しない）**: `job show` / `doctor` の観測経路が throw に依存しない設計が成立。既存 caller は `corruption` フィールドを無視するだけで無変更 green。✓
- **D2（array を破損扱い）**: `typeof [] === "object"` なので明示排除は必要。既存テストに array 中間行を許容するものがないことも設計内で確認済み。✓
- **D3（`detectCounterReversal` 純関数）**: `persist()` / `doctor` / `inspectJournalDir` 3 箇所が共有。逆行の定義「stored > actual のみ」は append→counters の書き込み順保証と整合。✓
- **D4（`JOURNAL_CORRUPTED` error code）**: `EXIT_CODE_MAP` 未登録で GENERAL_ERROR(1)。`stateFileInvalidError` と同様のパターン。✓
- **D5（`composeSplitLayout` / `loadSplitLayout` 分割）**: `list()` 5 箇所（1, 1b, 2, 3, 4）を tolerant に切り替え、`load()` / `loadStateByJobId` は fail-closed を維持。`recover counters = fold 由来` に変更後も `detectCounterReversal` が null を返した時点で `fold ≥ stored` が保証されるため、スプレッド `{ ...existingCounters.stepCounts, ...foldResult.stepCounts }` は正確。✓
- **D6（job show の probe）**: UUID ルートは `loadStateByJobId` が JOURNAL_CORRUPTED を throw → catch で corruption banner、slug ルートは tolerant な `list()` → `printJobState` 内 `inspectJournalDir` probe。両ルートともに crash なし。✓
- **D7（doctor factory パターン）**: `orphanWorktreesCheck` と同一構造。`ctx.cwd` を `repoRoot` として使用。doctor runner の exit code 決定が `status === "fail" → 1`（`required` 非依存）であることを `src/cli/doctor.ts:206` と `DoctorCheck` コメントで確認。✓

### 既存テストへの影響確認

- `TC-004`（末尾 partial drop）: 新仕様でも末尾 partial は破損扱いせず drop → 無変更 green ✓
- `TC-003`（fold > stored のクラッシュリカバリ）: 新仕様では fold > stored は逆行ではなく正常系 → 無変更 green ✓
- `TC-030`（delta-append 冪等性）: fold-ahead 経路は `detectCounterReversal` が null → persist 成功 → 無変更 green ✓
- 中間行の silent-skip を固定するテスト: `event-journal.test.ts` に存在しないことを確認済み（TC-004 は末尾 partial のみ、TC-028 等は full valid journal のみ）→ 既存テストは全件無変更 green ✓
- `all-checks.test.ts`（`allChecks.length >= 17`）: `commonChecks` が 16 → 17 になり `allChecks` が 25 → 26。閾値 17 を超える ✓

### セキュリティ評価（OWASP Top 10）

本変更はローカル CLI ツール内部のファイルシステム読み取りに限定。ネットワーク通信・認証・セッション管理は関与しない。適用対象となる項目なし。上記 Finding #1（snippet 経由の ANSI 注入）は LOW リスク、現時点では対処不要。
