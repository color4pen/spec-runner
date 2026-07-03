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
| 1 | MEDIUM | Consistency | tasks.md / design.md | T-07 の doctor check が design の Open Question と矛盾している。T-07 は「reject → `{ status:'fail' }`」と一律に記述しているが、design.md の Open Question では「ENOENT のみを『不在』と判定し、present だが flag 非対応は warn 扱い」を fallback として明示している。`aozu --version` の契約非保証を前提にすると、T-07 の仕様だけを読んだ実装者がすべての execFile reject を fail にすることで、aozu インストール済みだが `--version` 未対応の場合に doctor が誤って fail を返す。 | T-07 の Acceptance Criteria に「execFile が ENOENT で reject した場合のみ `fail`、それ以外の reject（コマンド不在でない場合）は `warn` を返すことをテストで固定」を追記する。または design.md Open Question を「実装時に `--version` 非対応の場合は warn」と結論付けて T-07 本文に反映する。 |
| 2 | LOW | Completeness | tasks.md | T-04 の `executeValidate` 変更で「`parseRequestMdContent` の戻り値を変数に保存して `.type` を取得する」という実装上の変更が必要になるが、タスク本文に明示されていない。現行コードは `parseRequestMdContent(content, filePath)` の戻り値を捨てている。 | T-04 の本文に「parse 成功時の戻り値を `parsed` として保存し `parsed.type` を `requestType` として gate に渡す」を追記する（自明な変更だが実装スロットを埋める）。 |
| 3 | LOW | Security | design.md / tasks.md | `git add -A` が worktree 内のすべての untracked/modified ファイルを staging する点は D7 で acknowledged されているが、no-worktree モードでは main repo 上で checkout → archive を実行するため、開発中の uncommitted 変更がある場合に意図しないファイルが archive コミットへ混入するリスクが残る。no-worktree モードは `--no-worktree` 明示オプション使用時のみであり、通常 CI 環境ではクリーンが前提のため実害は限定的。 | Risks 節に「no-worktree モードで開発中の uncommitted 変更が存在する場合、`git add -A` がそれらも取り込む可能性がある。`mark-hook.ts` は `git status --porcelain` で staging 前の差分を確認し、aozu が書いたファイル以外（`design/` 外）が含まれる場合に警告を出すか、or no-worktree 使用時はこの副作用をドキュメントで注意喚起する」を追記する（ブロッカーではなく参考）。 |

## 検証メモ（機械非解析）

### アーキテクチャ整合性

- **orchestrator の設計不変条件**: base ブランチへの直接 commit/push 禁止は維持されている。mark hook の state 変更は archive コミットに相乗りして feature ブランチへ push され、base への反映は既存 squash merge が担う設計は正しい。
- **code reference 精度**: `orchestrator.ts` Phase 0 での state load（`JobStateStore.list`）・Phase 1 の `git add specrunner/changes/`（:269）・`commitArchive`（:275）の挿入点は実コードと一致している。`merge-then-archive.ts:142` の `prNumber = state.pullRequest.number` も実コードと一致している。
- **config schema パターン**: `resolveInboxConfig` / `resolveTransientRetryConfig` と同型の `resolveDesignLayerConfig` 追加は既存パターンに整合。zod スキーマへの `designLayer` 追加は他 optional セクションと同型で後方互換が維持される。
- **DoctorConfig.get dotted-path**: `DoctorConfig.get()` のインターフェース（types.ts:141）は "e.g. 'github.accessToken' or 'agents.design.agentId'" とドット記法を明示しているため、`ctx.config.get("designLayer.enabled")` / `ctx.config.get("designLayer.command")` は問題なし。
- **SpawnFn 注入**: `spawnCommand`（shell:false）経由のため、`designLayer.command` に任意コマンド名を渡してもシェルインジェクションは発生しない。セキュリティ上問題なし。

### テスト戦略

- 実物 aozu への依存を持たない fake SpawnFn / fake execFile 注入は適切。
- archive コミット包含テスト（実 temp git repo + fake SpawnFn）は受け入れ基準を決定的に固定できる。
- 既存テストへの影響: `designLayer` 未設定（enabled=false）が既定のため、既存 preflight テスト・validate テスト・archive テストはすべて no-op 経路を通り無変更で green が期待できる。

### 総評

設計判断（D1–D7）はすべて architect 評価済みの選択肢から导かれており、request の設計不変条件を守っている。スコープ外の明示も適切。MEDIUM 以上の blocking issue はなし。
