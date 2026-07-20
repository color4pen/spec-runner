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
| 1 | LOW | design | design.md | `DoctorContext.repoRoot` が optional (`string \| null \| undefined`) である点は、将来の check 実装者が `ctx.repoRoot` を参照し忘れて `ctx.cwd` に落ちるリスクを残す。design.md はこれを既知の Risk として記載し、T1 mutation check で緩和している。 | 現状の緩和策（T1 mutation check）で十分と判断。後続 request で全 check が転換されたタイミングで `required` に昇格できる。本 request ではアクション不要。 |
| 2 | LOW | design | tasks.md / arch-allowlist.ts | CWD allowlist seed（~40 エントリ）の完全性は「テストが失敗したら追加する」自己修正メカニズムに依存している（design.md Risk §3 で明示済み）。同一ファイル内の同一行が 1 エントリに折りたたまれるため、将来の同一内容の重複行が自動カバーされる副作用がある。 | 既存 B-6 ratchet と同型の既知制約であり受容済み。seed 完全性は implementer が failing test 出力から確認する設計になっており問題なし。アクション不要。 |

## 検証サマリ

### 問題記述の実コード照合

- `src/cli/command-registry.ts:334` — `executeNew(slug, requestType, process.cwd())` ✓
- `src/cli/command-registry.ts:683` — `runJobStats({ cwd: process.cwd(), ... })` ✓
- `src/cli/doctor.ts:174` — `cwd: process.cwd()` ✓
- `src/cli/doctor.ts:114` — `resolveRepoRoot(process.cwd()).catch(() => null)` ✓（T-04 で削除対象）
- `src/util/repo-root.ts:8` — `resolveRepoRoot(cwd?: string)` ✓
- `src/cli/job-show.ts:42` — `(await resolveRepoRoot()) ?? process.cwd()` ✓（graceful degradation 先例）
- `bin/specrunner.ts` 両 dispatch ブランチ（`:101` subcommand / `:137` normal）で handler を呼ぶ前に `ctx` を構築して渡す変更点が T-01 に明記されている ✓

### 設計決定の妥当性

**D1（dispatch-time 単一解決 + CommandContext injection）**: `src/cli/command-context.ts` が `src/util/` のみを import するため、DSM closure で `composition-root → leaf` の合法な辺であり新規違反なし。TS の引数 fewer-than 代入互換により既存 handler を無編集で維持できる。

**D2（requiresRepo + 統一エラー）**: `NOT_GIT_REPO` 既存エラーコードを再利用するため exit code マッピング変更なし。`bin/specrunner.ts` の `SpecRunnerError` catch ブロックがそのまま機能する。

**D3（job stats / request new の最小外科修正）**: call site 2 箇所のみの変更。下流関数（`runJobStats`, `executeNew`）の署名・既存 unit test は無変更。

**D4（doctor の `repoRoot?` 追加）**: `opts.repoRoot !== undefined` で `null`（repo 外）と `undefined`（未提供）を区別しており、自己解決ロジックが正確。`ctx.repoRoot ?? ctx.cwd` の fallback idiom は `job-show.ts:42` の先例と一致。

**D5（worktree 意味論）**: `resolveRepoRoot` 自体は不変。`git rev-parse --show-toplevel` は既に worktree 内で enclosing root を返す。

**D6（CWD ratchet）**: B-6 (`process.env`) 既存 ratchet と同型。`src/` 全域スキャン + liveness + T-04 style regression guard の三重構造が揃っている。

### セキュリティ観点

- `resolveRepoRoot` は `spawnCommand` の `cwd` オプションとして渡すのみであり、シェル文字列補間なし。コマンドインジェクションの経路なし。
- `repoRoot` の値は git が返す絶対パスであり、ユーザー操作によるパス・トラバーサルの余地なし。
- 新たな `process.env` 直接参照、`node:child_process` 直接 import、stdout/stderr 直接 write なし（B-6/B-7/B-12 への影響なし）。
- エラーメッセージ（`git init` / `cd` 処方）に機密情報を含まない。

### スコープ外の妥当性

`command-registry.ts:388`（slug ベース `storeResolve(process.cwd(), input)`）は subdirectory 起動時に誤動作するが、T4 の acceptance criterion は FILE パスケースのみを対象とし、slug ケースは Debt として明示的に延期されている。scope 決定は合理的。

### T1–T7 機械検証可能性

各受け入れ基準は fixture fs / injectable resolver / `runDoctor` 直接呼び出し / dispatch ハーネス (`bin/specrunner.ts` import) を組み合わせており、いずれも CI で機械検証可能な形になっている。T1 の mutation check（cwd 直接使用に戻すと失敗）が D4 の最大リスクを pin している。
