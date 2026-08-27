# Code Review Feedback — split-reopen-from-resume — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| ファイル / 観点 | 確認内容 |
|---|---|
| `src/core/command/reopen.ts` | `ReopenCommand` が `CommandRunner` を継承していないこと。`execute()` が awaiting-archive → awaiting-resume のみ遷移し pipeline を起動しないこと。`appendOperatorEvent` が `persist` より先に呼ばれること。patch が run-control フィールドのみ（`error/resumePoint/mainCheckoutDrift/pid: null`）であること。 |
| `src/state/lifecycle.ts` | `REOPEN_TRANSITIONS` が `awaiting-archive → awaiting-resume` に変更済みであること。`transitionJob` の `@param opts.allowReopen` JSDoc が `awaiting-resume` を正しく記述していること。`TransitionOpts` interface JSDoc が旧 `ReopenCommand.prepare()` 参照を残していること（F-001）。 |
| `src/state/__tests__/lifecycle-reopen.test.ts` | TC-016 が `awaiting-resume` を assert すること。TC-017-d が `canTransition("awaiting-archive", "awaiting-resume")` の false を検証すること。TC-002 が general guard の保存を確認していること。 |
| `src/core/command/__tests__/reopen-command.test.ts` | TC-001〜TC-011、TC-015、TC-020、TC-021、TC-029、TC-030 が全て `execute()` ベースで実装済みであること。`callPrepare`/`makeRuntime`/`makeEventBus` 等の旧ヘルパーが存在しないこと。invocationCallOrder による appendOperatorEvent → persist の順序保証が TC-010 で確認済みであること。 |
| `src/cli/reopen.ts` | `bootstrap()` / `wireProgressDisplay()` / `new EventBus()` が削除されていること。GitHub client の optional 解決のみを行いシンプルな wrapper になっていること。 |
| `src/cli/command-registry.ts` | `reopen` subcommand の `flags` に `from` が存在しないこと。`REOPEN_USAGE` が `--from` を option として列挙せず resume への誘導 note を含むこと。 |
| `src/cli/__tests__/command-registry-reopen.test.ts` | TC-012-a が `reopenCmd.flags["from"] === undefined` を assert すること。TC-025 が `REOPEN_USAGE` Options block に `--from` が含まれないことを検証すること。 |
| `src/store/event-journal.ts` | `OperatorEventRecord.fromStep` が `optional` になっていること。旧 record（fromStep あり）との後方互換が TC-009-a/b/c で確認済みであること。 |
| `.github/workflows/specrunner-dispatch.yml` | `action=reopen` ブランチで `job reopen --reason` → `job resume --from` の 2 コマンドが順次実行されること（行 243–246）。ヘッダーコメント（行 23、29）が旧 single-command interface を記述したまま残っていること（F-002）。 |
| `tests/unit/workflow/specrunner-dispatch.test.ts` | TC-019 が `job reopen` 前 / `job resume` 後の順序を assert すること。TC-019-f が `--reason` が `job reopen` 行にあることを確認すること。 |
| `tests/unit/architecture/core-invariants.test.ts` | B-17 JSDoc が `awaiting-archive → awaiting-resume transition` に更新済みであること。liveness check が `candidates.length > 0` で通ること。 |
| `architecture/conformance.md` | B-17 行に `（ガード対象: awaiting-archive → awaiting-resume）` の括弧書きが追加済みであること。 |
| `src/core/command/guide.ts` | escalation topic の `## 3` 節が 2 ステップフロー（reopen → resume）で記述されていること。`job reopen` オプション欄に `--from` が記載されていないこと。 |
| `verification-result.md` | build / typecheck / test / lint / changed-line-coverage 全フェーズが exit 0 であること。 |
| `specrunner/adr/2026-07-22-job-reopen-awaiting-archive.md` | 既存 ADR が旧設計（`--from` 必須、`awaiting-archive → running`、`prepare()` 参照）を記述したまま修正されていないこと（informational — adr-gen ステップで更新予定）。 |

## 検証できなかった項目

- `job resume <slug> --from <step> --prompt <text>` が reopen 後の awaiting-resume 状態で実際に動作すること（TC-013 は ResumeCommand の unit mock で確認しているが、e2e は実行していない）。ただし resume のコードパスは本変更で変更なし。

## Findings 詳細

### F-001 · LOW · FIXABLE — `TransitionOpts` JSDoc が旧 `ReopenCommand.prepare()` を参照

`src/state/lifecycle.ts` 89 行目：

```ts
 * Must only be passed by ReopenCommand.prepare() — never by resume or other callers.
```

`ReopenCommand` は本変更で `CommandRunner` サブクラスから単独クラスに変更され、`prepare()` メソッドは削除された。JSDoc は `ReopenCommand.execute()` に修正すべき。

同ファイル 102–104 行の `@param opts.allowReopen` コメントは `awaiting-resume` を正しく記述しているため、行動変化の説明に齟齬はなく、機能的影響はない。

---

### F-002 · LOW · FIXABLE — ワークフローヘッダーコメントが旧 single-command reopen を記述

`.github/workflows/specrunner-dispatch.yml` 23 行目：

```
#           job reopen <slug> --from <step> --reason <text>。reopen transition 自体は
```

29 行目：

```
#           prompt は透過しない。
```

実装（243–246 行）は正しく 2 ステップになっているが、ファイル先頭のコメントブロックが旧インタフェースのまま残っている。"prompt は透過しない" も不正確（`$PROMPT` は `job resume` に転送される）。

機能的影響なし。ただし将来の operator が workflow のコメントを参照したとき誤解を招く。

---

## ポジティブ観察点

- **`ReopenCommand` のデカップリングが完全かつ機械的に検証されている。** TC-020 が `instanceof CommandRunner === false` と `"prepare" in cmd === false` の両方を assert。TypeScript typecheck がゼロエラーで通過済み。
- **D6 の durability 順序が `invocationCallOrder` でピン留めされている。** `appendOperatorEvent` が `persist` より必ず先に呼ばれることを vitest の呼び出し順 API で検証（TC-010）。
- **B-17 アーキテクチャ不変条件が liveness 検査付きで維持されている。** `core-invariants.test.ts` が `candidates.length > 0`（`reopen.ts` に `{ allowReopen: true }` が存在すること）を確認してから confinement を検査している。
- **後方互換対応が TC-009-c で明示的に確認されている。** `fromStep` ありの旧レコードと `fromStep` なしの新レコードが混在するジャーナルを `fold()` が正しく処理することを確認済み。
- **Actions ワークフローの 2 ステップ compose が両方向から確認されている。** `specrunner-dispatch.test.ts`（TC-019）と `dispatch-workflow-reopen-action.test.ts`（TC-R02）が独立して `job reopen` 行に `--from` が含まれないことを assert。
