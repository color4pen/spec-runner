# Cross-Boundary Invariants Review — error-prescription-integrity — iter 1

- **verdict**: approved

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した不変条件

### A. 終了コード不変（`NOT_GIT_REPO` → `ARG_ERROR = 2`）

`originNotConfiguredError()` は `NOT_GIT_REPO` コードを再利用する（`errors.ts:155`）。
`EXIT_CODE_MAP` の `NOT_GIT_REPO: EXIT_CODE.ARG_ERROR` は変更なし（`:24`）。
変更前の inline `SpecRunnerError` も同コードだったため、exit code は bit-identical に維持されている。

`repoRequiredError()` も同コードを使う（別 change で追加済み）が、routing ロジックで `error.code` を switch している箇所は存在しない。`EXIT_CODE_MAP` のみが利用者であり、不変。✓

### B. `notGitRepoError()` との境界保持

`src/git/remote.ts` の分岐は:
- `gitDirCode === 0`（git repo 内、origin なし）→ `originNotConfiguredError()` ✓
- `gitDirCode !== 0`（git repo 外）→ `notGitRepoError()` ✓
- spawn 例外 → `notGitRepoError()` ✓

「cd into a git repository」処方は真に non-git-repo の経路（`notGitRepoError()`）にのみ残り、
origin-not-configured 経路とは明確に分離されている。

### C. `--json` スキーマ不変

`formatJson` は無改変（`formatter.ts:112-147`）。
`src/cli/doctor.ts:221` での分岐 `opts.json ? formatJson : formatHuman` も変更なし。
`--json` 経路には `deriveNextSteps` は一切関与しない。✓

### D. git fetch エラー wrap の chain 保持

`describeGitFetchFailure` は `string` を返す（`git-fetch-error.ts`）。
`local.ts:465` は `throw new Error(describeGitFetchFailure(...))` と generic Error でラップする。
`runner.ts:132` は `(err as Error).message` で捕捉し `WORKSPACE_SETUP_FAILED` に包む。
エラーが `SpecRunnerError` に変更されていないため、runner.ts の分岐ロジックは無傷。✓

### E. `DoctorContext` 注入パターン拡張

`configPath: string`（必須フィールド）が `types.ts:157` に追加された。
以下の全ての直接構築箇所に `configPath` が供給されていることを確認した:
- `tests/core/doctor/mock-context.ts:77` — デフォルト `/fake/home/.config/specrunner/config.json`
- `tests/unit/cli/doctor-repo-root.test.ts:107` — 同値
- `tests/unit/core/doctor/orphan-worktrees-check.test.ts:36` — 同値
- `tests/unit/core/doctor/aozu-cli-check.test.ts:35` — 同値
- `tests/unit/core/doctor/orphan-sidecars-check.test.ts:40` — 同値
- `tests/core/doctor/checks/storage/journal-integrity.test.ts:45` — 同値
- `src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts:38` — 同値
- `src/core/doctor/checks/runtime/__tests__/aozu-cli.test.ts:45` — 同値
- `src/cli/doctor.ts:209` — `configPath: getConfigPath()`（本番組み立て）

`typecheck` が green であることが `verification-result.md` で確認されており、
TypeScript の型検査が全構築箇所を強制している。✓

### F. `next-steps.ts` RULES のチェック名バインディング

`RULES` で使用する 5 つのチェック名が実際の `DoctorCheck.name` と一致することを確認:

| RULES 内の文字列 | 実ファイルの `name` |
|---|---|
| `"git-repository"` | `git-repository.ts:9` ✓ |
| `"github-origin"` | `github-origin.ts:8` ✓ |
| `"config-file-exists"` | `file-exists.ts:9` ✓ |
| `"github-token-present"` | `github-token-present.ts:8` ✓ |
| `"github-token-valid"` | `github-token-valid.ts:9` ✓ |

### G. doctor における token 解決失敗の隠蔽経路

`src/cli/doctor.ts` では `resolveGitHubToken()` の例外を catch してブランクにする（`resolvedGitHubToken = null`）。
`github.ts:124` の SpecRunnerError hint（旧三択形式が残存）は doctor 出力に一切現れない。
doctor は代わりに `github-token-present` check の hint（修正済み）を使う。

`github.ts:124` の旧形式は `run` コマンドのトークン解決失敗時に表示されうるが、
これは T-05 のスコープ外（tasks.md で明示: doctor check 2 ファイルのみ対象）。
`hint-command-references.test.ts` は `specrunner login` を valid として通過する。✓

### H. `extractHints` の収集スコープ

`hint-command-references.test.ts` の正規表現は:
- `hint: "..."` / `'...'` / `` `...` `` プロパティリテラル
- `new SpecRunnerError(code, "hint", ...)` の第2引数

を対象とし、`logInfo` / `message` / `recommendedAction` / バナーは捕捉しない。
設計の「誤検出回避」の意図と一致。

`orchestrator.ts` / `resolve-target.ts` / `managed.ts` に残る `specrunner ps` / `specrunner managed setup`
の参照はすべて `message` / `recommendedAction` / `logInfo` フィールドであり、
設計が明示的に記録した「スコープ外の stale 参照」。歯の対象外。✓

---

## 観察（non-blocking）

### O1 — `file-exists.ts` のコメントと実装の不整合（LOW）

`file-exists.ts:14-15` のコメント:
> `// Fallback for backward-compat: if configPath is absent (old mocks), use homeDir path.`

実際のコードは `const configPath = ctx.configPath;` のみで fallback を実装していない。
TypeScript が `configPath` を必須フィールドとして強制するため、
「old mocks」が TypeScript コンパイルを通過することは無い。
コメントが存在しない実装を示唆しており、将来の読者に誤解を与える可能性がある。

影響: runtime 挙動に変化なし。文書品質の問題。

### O2 — `extractHints` の文字列結合カバレッジギャップ（LOW）

`hint-command-references.test.ts` の `extractHints` は文字列結合
（`"part1" + "part2"` 形式）で構築された hint を捕捉しない。
現時点では `specrunner` コマンド参照を含む結合 hint は存在しない。
将来、結合形式で hint を追加した場合、歯をサイレントに回避できる。

影響: 現在の coverage は完全。将来の追加で false negative が発生しうる。

### O3 — `next-steps.ts` RULES のチェック名はマジック文字列（LOW）

RULES のチェック名は compile-time binding を持たない。
いずれかのチェックが rename された場合、`deriveNextSteps` はそのチェックに対してサイレントに
空配列を返す（next steps が消える）。
`next-steps.test.ts` が正しいチェック名を fixture に使っているため、
チェック名の変更は型検査でなくテストで初めて検出される。

影響: rename 時に next steps が消えるサイレント劣化。現時点では問題なし。

---

## 総評

9 個の不変条件を検証し、すべてが保持されていることを確認した。
critical / high / medium の所見は無し。
3 件の low 観察はいずれも現時点での runtime 影響なし。
