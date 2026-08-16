# Code Review Feedback — cli-command-spec — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（35 ファイル変更、+3520/-449 行）
- `src/cli/command-registry.ts` — CommandSpec 型・COMMANDS registry・resolveCommand・listCommandPaths・resolveEffectiveRequiresRepo・generateTopLevelUsage を精読
- `bin/specrunner.ts` — 単一 dispatch flow を精読（help pre-scan → worktree guard → parseFlags → requiresRepo → handler → catch）
- `src/cli/flag-parser.ts` — integer 型検証と deprecated flag の実装を確認
- `tests/unit/cli/command-spec-api.test.ts` — TC-001〜TC-037 の全カバレッジ確認
- `tests/unit/cli/specrunner-worktree-guard.test.ts` — TC-WG-001〜TC-WG-008 を確認
- `tests/unit/cli/doctor-repair.test.ts` — TC-DR-001〜TC-DR-003 を確認
- `tests/unit/cli/removed-commands.test.ts` — 旧コマンドの `Unknown command:` 文言保存を確認
- `tests/unit/cli/resume-help.test.ts` / `tests/unit/cli/help-output-tc.test.ts` — help pin テスト確認
- `src/cli/__tests__/detach-output-contract.test.ts` — USAGE pin テスト（--detach / job wait）確認
- `src/cli/__tests__/login.test.ts` — login --provider 非表示 + deprecated 移行エラー確認
- `tests/hint-command-existence.test.ts` — diff 確認（`Object.keys(COMMANDS)` のまま、`listCommandPaths` 未使用）
- `tests/unit/cli/hint-command-references.test.ts` — diff 確認（`subcommands` → `children` に変更のみ、`listCommandPaths` 未使用）
- TC-035: `WORKTREE_GUARDED_COMMANDS` / `guardedSubcommands` がコードベースに不在であることを grep で確認
- verification-result.md で typecheck && test が全 green であることを確認

## 検証できなかった項目

- TC-007/TC-008 の integration パス（dispatch を通した null repoRoot での doctor 動作）— unit 代替が存在し AC としては成立
- `run --help` の実際の出力内容（既存テストに pin がなく手動確認も行っていない）

## Findings 詳細

### F-001: TC-034 未実装 — hint 実在検査が `listCommandPaths` を使っていない

test-cases.md TC-034（priority: must）は「hint-command-references.test.ts が `listCommandPaths({ includeAliases: true })` を正本とし検査する」と規定する。

実際の変更:

```diff
# hint-command-references.test.ts
-    if ("subcommands" in entry) {
-      map.set(name, new Set(Object.keys(entry.subcommands)));
+    if (entry.children) {
+      map.set(name, new Set(Object.keys(entry.children)));
```

```diff
# hint-command-existence.test.ts
-import type { CommandEntry, ParentCommandDef } from "../src/cli/command-registry.js";
+import type { CommandSpec } from "../src/cli/command-registry.js";
```

どちらも `Object.keys(COMMANDS)` によるトップレベルキー Set を維持しており、`listCommandPaths` は未使用。現在は `run` が COMMANDS の直接エントリ（aliasOf 付き）として残っているため動作するが、この依存は脆弱。TC-034 の要求は「hint 実在検査が spec 由来の列挙 API を使う」ことであり、未達。

**修正方法**: 両テストの `registeredCommands` / `validTopLevel` の構築を以下のように切り替える:

```ts
import { listCommandPaths } from "../src/cli/command-registry.js";
// 全 path（alias 含む）を flat な "verb" / "verb sub" Set に変換
const paths = listCommandPaths({ includeAliases: true });
const validTopLevel = new Set(paths.map((p) => p[0]!));
const subcommandMap: Map<string, Set<string>> = new Map();
for (const p of paths) {
  if (p.length >= 2) {
    (subcommandMap.get(p[0]!) ?? subcommandMap.set(p[0]!, new Set()).get(p[0]!))!.add(p[1]!);
  }
}
```

### F-002: stale コメント — `WORKTREE_GUARDED_COMMANDS` への言及

`tests/unit/cli/specrunner-worktree-guard.test.ts:147`:

```ts
it("exits with code 2 via top-level WORKTREE_GUARDED_COMMANDS (WORKTREE_GUARD → ARG_ERROR)", ...
```

`WORKTREE_GUARDED_COMMANDS` はこの PR で削除されており、現在の仕組みは「`run` が `job start` の alias として解決され、`job start.worktreeGuard === true` から guard が導出される」である。テスト挙動は正しいが説明文が実装と乖離している。

**修正方法**: it(...) の説明を "exits with code 2 via spec-derived worktreeGuard (inherited from job start via alias)" 等に変更する。
