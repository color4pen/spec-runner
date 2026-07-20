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
| 1 | LOW | behavior-change | design.md (D2 consequence) | `init` の「git バイナリ未インストール」診断メッセージ（exit 128 と exit null の区別）が `requiresRepo` ガードに吸収されて消える。design.md リスクセクションには記載があるが spec.md の要件には触れられていない。既存ユーザーが `git` を入れていない環境で `specrunner init` を叩くと "please install git" ではなく統一エラーが出る。 | `doctor` が git 不在を診断するため機能喪失は限定的。意図的なトレードオフとして tasks の T-02 受け入れ基準に既に明示されており（"init git-availability gate tests relocated"）、実装上の問題なし。このまま進めてよい。 |

## Review Notes

### 確認した事実

コードを直接読んで以下を検証した。

**インフラ確認（実装済み）:**
- `bin/specrunner.ts:102,148` — `buildCommandContext(process.cwd())` がサブコマンド・通常コマンド両経路で呼ばれ、`ctx` が handler に渡る構造は確認済み。
- `bin/specrunner.ts:103-108,149-154` — `requiresRepo` guard が既に動作する（`request new`・`job stats` で実績あり）。
- `src/cli/command-context.ts` — `CommandContext { repoRoot, invokerCwd }` と `buildCommandContext(invokerCwd, resolveFn?)` が実装済み。resolver injectable でテスト可能。
- `CommandDef.handler: (parsed, ctx?) => Promise<void>` — 第 2 引数が optional なので既存 handler は変更不要（型互換確認済み）。

**影響 handler の現状コード確認:**
- `init.ts:74` — `spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })` を直接実行：確認済み。
- `inbox.ts:32,46` — `const cwd = process.cwd()` → `resolveRepoRootOrFail(cwd)`：確認済み。
- `prune.ts:36,42` — dynamic import で `resolveRepoRootOrFail()` を呼ぶ（vi.mock バインディング用の lazy import 構造は維持対象）：確認済み。
- `cancel.ts:60` — `resolveRepoRootOrFail()`：確認済み。
- `config-effective.ts:57,65` — `options.cwd ?? process.cwd()` → `resolveRepoRoot(cwd)`：確認済み。
- `job-show.ts:42` — `(await resolveRepoRoot()) ?? process.cwd()`：確認済み。
- `bootstrap.ts:36` — `resolveRepoRoot(cwd)`：確認済み。
- `attach.ts:66` — `(await resolveRepoRoot(cwd)) ?? cwd`：確認済み。
- `ps.ts:87` — `opts.repoRoot ?? (await resolveRepoRoot()) ?? process.cwd()`：確認済み、DI fallback として維持対象。

**allowlist 確認:**
- `arch-allowlist.ts` で削除対象 4 エントリ（`CWD-init-git-spawn`, `CWD-job-show-root-resolve`, `CWD-inbox-debt`, `CWD-config-effective-di-default`）が現在エントリとして存在：確認済み。
- 維持対象 2 エントリ（`CWD-ps-root-resolve`, `CWD-job-show-print-default`）も存在：確認済み。

**B-13 衝突確認:**
- `architecture/model.md:91` — B-13 は StepExecutor single-writer 不変として使用中：確認済み。
- `specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md:76,78,152,168` — 4 箇所で B-13 を CWD ratchet 識別子として使用：確認済み。
- `load-config-with-overlay.ts` — `(cwd?, preResolved?)` シグネチャを確認。`inbox.ts` が `loadConfigWithOverlay(repoRoot, repoRoot)` と呼べば pre-resolved パスを辿り `resolveRepoRoot` を迂回する：確認済み。

### 設計判断の評価

**D1（context 注入）**: 正しい。dispatch の choke point は既に確立されており、handler を `(parsed, ctx) => …` に揃えるだけ。

**D2（requiresRepo guard）**: 正しい。`requiresRepo` 宣言 + dispatch guard を `init`/`inbox run`/`job prune`/`job cancel`/`job attach` に追加する最小変更で per-handler エラーを廃せる。唯一の可視副作用は init の git 不在診断消失（Finding #1）だが、意図的なトレードオフ。

**D3（repo-optional コマンドの ctx 消費）**: 正しい。`job show`・`config effective`・`job resume → bootstrap` を `ctx.repoRoot ?? ctx.invokerCwd` で繋ぐ方法は既存パターン（`ps.ts:87`）と一貫。

**D4（ps.ts DI fallback 維持）**: 正しい。registry 側が `repoRoot: ctx.repoRoot ?? ctx.invokerCwd` を注入するため production 経路では内部 fallback は起動しない。テストの injection seam を壊さずに済む合理的な選択。

**D5（grep 不変量）**: 正しい。confinement（`src/cli/` で `resolveRepoRoot*` を検出し allowed-set 外を violation とする） + no-direct-git（`show-toplevel` が空） + liveness の 3 層構成は既存の CWD 不変量（T-05）と対称で実績あり。`RESOLVE_REPO_ROOT_ALLOWED_FILES` を `ARCH_ALLOWLIST` と分離する判断（permanent structural carve-out vs. delete-only ratchet）も正しい。

**D6（CWD burn-down）**: 正しい。4 エントリ削除 + 2 エントリ維持の根拠が明確。カウントは純減。

**D7（ADR B-13 fix）**: 正しい。`model.md` の安定識別子 B-13 を動かさず、ADR 文書のみを `CWD`/`T-05` 表記に揃える最小コスト修正。

### セキュリティ評価

この変更はリポジトリ root 解決の配線替えであり、新規の外部 I/O、認証変更、secret 取り扱い変更は一切ない。

- **パストラバーサル**: `repoRoot` は `git rev-parse --show-toplevel` 由来（既存メカニズム）。新規のユーザー入力由来パス構築なし。
- **B-6（subprocess env）**: 変更対象ファイルで stripSecrets 経路に影響なし。
- **B-12（child_process import）**: `init.ts` の `spawnCommand("git", ...)` 削除は B-12 観点で改善（seam 経由 spawn が残るが、handler 内の直接 git 呼び出しが消える）。
- **requiresRepo guard 追加**: 権限確認はなく、単に「git repo が存在しない」を早期 exit するだけ。攻撃面の縮小のみ。
- OWASP Top 10: 該当なし（リファクタリング）。

### 総括

spec は完全・一貫しており実装準備が整っている。要件はすべて機械検証可能で、タスクは明確な受け入れ基準を持つ。スコープ外侵食なし。
