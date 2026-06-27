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
| 1 | LOW | Clarity | tasks.md (T-04) | `evacuateChangeFolder` が null を返した場合（slug が空で退避先を算出できないケース）の `canceledDirAbs` の扱いが T-04 に明記されていない。`JobStateStore` のコンストラクタは `changeDir: null` を渡されると `getStateJsonPath()` で throw するため、null チェックなしに persist を呼ぶと実行時エラーになる実装トラップがある。 | T-04 の "5. canceled persist" ステップに「`evacuateChangeFolder` が null を返した（slug 空）場合は canceled persist もスキップする」旨を 1 行追記する。spec.md のベストエフォート要件（"the system MUST emit a warning"）と矛盾はなく、本文修正は最小限。 |
| 2 | LOW | Testability | tasks.md (T-06) | `cancelAllTerminated` テストを worktree-only レイアウトに切り替えた際、`JobStateStore.list` が worktree を検出できるかどうかが `buildWorktreePath` の返すパス（`<tempDir>/.git/specrunner-worktrees/<slug>-<jobId8>`）と `list()` の worktree スキャンパス（`<repoRoot>/.git/specrunner-worktrees/`）が一致することに依存している。この前提が T-06 の説明に明記されておらず、実装者が別のパスを使うと `list()` で検出されない。 | T-06 の `cancelAllTerminated` 調整箇所に「`makeJob` の worktreeDir は `buildWorktreePath(tempDir, slug, jobId)` で算出し、`tempDir/.git/specrunner-worktrees/<slug>-<jobId8>` に state を配置すること（`JobStateStore.list` の worktree スキャン範囲と一致させるため）」を明記する。 |

## Review Notes

### 設計の正確性

設計が参照するコード箇所をすべて検証した。

- **D3 の `changeDir` seam**: `JobStateStore` コンストラクタに `opts?.changeDir` が実装済み（job-state-store.ts:156-162）。`getStateJsonPath()` / `getEventsPath()` も `changeDir` を最優先で参照する（:168-194）。D3 が前提とするインターフェースは既存であり、新規追加不要。
- **`resolveCanonicalStateDir`**: `src/core/finish/resolve-canonical-state-dir.ts` に実装済み。`load-by-job-id.ts` / `resolve-state-store.ts` / `local.ts` で既に使用されており、D4 の解決順序は現実のコードと一致する。
- **`JobStateStore.list` の archive skip**: job-state-store.ts:225 の `entry.name === "archive"` が確認できた。D7 の `canceled` 追加対象行が特定されており、変更は 1 行のみで安全。
- **現バグの再現**: `cancelSingleJob` の処理順（cleanup → persist、runner.ts:283-304）と `resolveStateStoreByJobId` がキャンセル後に null を返すケース（worktree 撤去済み）が設計書の分析と一致する。

### spec.md の完全性

5 つの requirement がすべて design decision と 1-to-1 で対応しており、各シナリオは実装者が unit test を書ける粒度。ベストエフォート条件（evacuation 失敗時の warning + persist継続）が requirement 本文に明記されており、spec としての記述は完全。

### セキュリティ

- `canceled/<slug>-<jobId8>/` のパスは `slug`（state から取得）と `jobId`（システム生成 UUID）で構成され、ユーザー入力が直接混入する経路はない。
- `fs.cp` の再帰コピー対象はジョブ自身の change-folder（システムが管理するディレクトリ）のみ。シンボリックリンク traversal 等のリスクは実質的にない（copyRecurse の用途は既存の `copy-artifacts.ts` パターンと同様）。
- 新規ネットワーク呼び出しなし。
- OWASP Top 10 に該当する要素なし。

### 結論

設計・仕様・タスクは整合しており、実装に進んで問題ない。2 件の LOW 指摘は実装前に tasks.md を 1-2 行補足すれば解消できるが、ブロッキング要件ではない。
