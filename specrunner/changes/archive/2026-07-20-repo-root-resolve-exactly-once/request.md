# repo root 解決を 1 invocation につき 1 回にする — handler 内再解決の除去と CWD 不変の識別子一意化

## Meta

- **type**: spec-change
- **slug**: repo-root-resolve-exactly-once
- **base-branch**: main
- **adr**: false

<!-- 既存 ADR（cwd-role-boundary-dispatch-context）の「exactly once」契約を実装に到達させる作業。新しい設計決定は識別子の採番のみで、ADR の decision 自体は変えない -->

## 背景

dispatch 時の repo root 一括解決（`buildCommandContext`）は導入済みだが、複数の handler が受け取った context を使わず独自に root を再解決しており、ADR `specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md` と spec の「exactly once（1 invocation につき root 解決 1 回）」表現に対して実装が不足している。ユーザー向け症状（subdirectory 同値）は解消済みで、これは契約と実装の乖離の解消である。

また同 ADR は CWD ratchet 不変を「B-13」と採番しているが、`architecture/model.md:91` の B-13 は既に StepExecutor single-writer 不変として使用されており、識別子が衝突している。invariant test 側の describe は「B-13 (arch pin): StepExecutor …」（`core-invariants.test.ts:1001`）と「CWD invariant … (T-05)」（`:1449`）で、テスト側に衝突は無い。衝突は ADR 文書のみ。

## 現状コードの前提

handler 内で root を再解決している箇所（dispatch 済み context を使っていない）:

- `src/cli/init.ts:74` — `spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })` を直接実行
- `src/cli/inbox.ts:46` — `resolveRepoRootOrFail(cwd)`
- `src/cli/prune.ts:36,42` — dynamic import した `resolveRepoRootOrFail()`
- `src/cli/cancel.ts:60` — `resolveRepoRootOrFail()`
- `src/cli/config-effective.ts:65` — `resolveRepoRoot(cwd)`
- `src/cli/job-show.ts:42` — `(await resolveRepoRoot()) ?? process.cwd()`
- `src/cli/bootstrap.ts:36` — `resolveRepoRoot(cwd)`
- `src/cli/attach.ts:66` — `(await resolveRepoRoot(cwd)) ?? cwd`
- `src/cli/ps.ts:87` — `opts.repoRoot ?? (await resolveRepoRoot()) ?? process.cwd()`（呼び出し元が repoRoot を渡せば再解決しない形は既にある）

前提となる既存構造:

- `src/cli/command-context.ts` — `buildCommandContext(invokerCwd, resolveFn?)` が dispatch（`bin/specrunner.ts`）で毎 invocation 呼ばれ、`CommandContext { repoRoot, invokerCwd }` が全 handler に渡っている。resolver は注入可能
- `src/cli/doctor.ts:113` / `src/cli/load-config-with-overlay.ts:24` — pre-resolved が渡らない場合のみ解決する DI fallback（production dispatch 経路では再解決しない）。この形は維持対象
- `tests/unit/architecture/arch-allowlist.ts` — CWD ratchet の allowlist に上記 debt 箇所が列挙されている（削除のみ可の規律）
- `tests/unit/architecture/core-invariants.test.ts:1447-` — CWD ratchet 不変（`process.cwd()` の allowlist gate）

## 要件

1. **handler 内再解決の除去**: 上記の各 handler を、dispatch から渡される `CommandContext` の `repoRoot` / `invokerCwd` を受け取る形に転換し、handler 内の `resolveRepoRoot*` 呼び出し・`git rev-parse` 直接実行を除去する。repo 必須のコマンドは既存の `requiresRepo` 宣言 + dispatch guard に寄せる（handler 内の個別エラーを統一エラーに置換）。テストからの注入経路（cwd / repoRoot をオプションで渡す形）は維持してよいが、production の dispatch 経路では再解決が起きないこと。
2. **exactly-once の歯**: 「1 invocation につき root 解決 1 回」を機械的に固定する。最低限、`src/cli/` の handler 層が `resolveRepoRoot*` を import / 呼び出ししないことを grep ベースの invariant で固定する（DI fallback として維持する `doctor.ts` / `load-config-with-overlay.ts` / `ps.ts` の default 引数型は allowlist で明示区分する）。
3. **allowlist の burn-down**: 転換した箇所に対応する CWD ratchet の allowlist エントリを削除する（削除のみ・追加なし）。
4. **識別子の一意化**: ADR 内の「B-13」表記を、model.md の既存採番と衝突しない一意な識別子に改める（未採番の ratchet 名（例: 既存 describe の「CWD invariant (T-05)」）へ揃えるか、model.md へ新規 B 番号を正式登録するかは設計判断。ADR の decision 内容自体は変更しない）。

## スコープ外

- `resolveRepoRoot` 実装自体の変更
- doctor / load-config-with-overlay の DI fallback 構造の変更
- worktree 検出（`detectWorktree`）等、root 解決以外の dispatch 前処理
- ADR の decision（cwd 二役境界）の変更

## 受け入れ基準

- [ ] **T1（転換の同値性）**: 転換した各コマンドについて、subdirectory からの実行が repo root からの実行と同一挙動であることをテストで固定する（既存 contract テストの拡張または追加。repo 必須コマンドは repo 外での統一エラーも固定する）。
- [ ] **T2（exactly-once の歯）**: handler 層への `resolveRepoRoot*` 呼び出し追加が invariant test で検出されることを固定する。**破壊確認**: 転換済み handler のいずれかに再解決呼び出しを戻すと落ちること。
- [ ] **T3（allowlist 縮小）**: 転換箇所の allowlist エントリが削除されており、エントリ数が増えていないこと。
- [ ] **T4（識別子一意）**: リポジトリ内で「B-13」が CWD 文脈で使用されていないこと（StepExecutor single-writer の既存 B-13 のみが残る）を grep で確認できる状態にする。
- [ ] **T5**: `typecheck && test` が green（転換に伴う既存テストの cwd 注入経路の期待更新を除き、既存テストは無変更で green）。

## architect 評価済みの設計判断

- **handler は context を受け取り、再解決しない**。→ 却下: handler ごとの resolveRepoRoot 呼び出し維持 + 呼び出し規約のみ（任意適用の漏れが元の欠陥構造であり、#866 で dispatch 一括解決を入れた意図に反する）。
- **歯は grep ベースの import / 呼び出し禁止**。→ 却下: 実行時の解決回数カウントのみ（テストが通る経路しか数えられず、新規コマンド追加時の漏れを検出できない。実行時カウントを補助的に足すのは可）。
- **ADR の採番修正は文書側で行い、decision は変えない**。→ 却下: model.md の既存 B-13 を改番（安定済みの不変識別子を動かすと参照が全て腐る）。
