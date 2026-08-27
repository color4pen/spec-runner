# Code Review Feedback — split-reopen-from-resume — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| ファイル / 観点 | 確認内容 |
|---|---|
| `src/core/command/reopen.ts` | iter1 F-001 の修正確認（TransitionOpts JSDoc が `execute()` 参照）。exit code 契約（worktree guard→2、論理エラー→1）の実装正確性。`appendOperatorEvent` → `persist` 順序。patch フィールド（run-control のみ）。 |
| `src/state/lifecycle.ts` | `REOPEN_TRANSITIONS` が `awaiting-archive → awaiting-resume` に変更済み。`transitionJob` JSDoc が `execute()` 参照かつ `awaiting-resume` を記述していること。 |
| `.github/workflows/specrunner-dispatch.yml` | iter1 F-002 の修正確認（ヘッダーコメントが 2 段呼び出しの新契約を記述）。実装行（243–247）が `job reopen --reason` → `job resume --from` の順序であること。 |
| `src/core/command/__tests__/reopen-command.test.ts` | vi.mock 宣言の重複有無。TC-001〜TC-011、TC-015、TC-020、TC-021、TC-029、TC-030 の実装と assertions の正確性。 |
| `src/state/__tests__/lifecycle-reopen.test.ts` | TC-016 が `awaiting-resume` を assert すること。TC-017-d が `canTransition("awaiting-archive", "awaiting-resume") === false` を確認すること。 |
| `src/store/__tests__/event-journal-operator-event.test.ts` | TC-009-a/b/c が fromStep 有無のレコードを正しく fold することを確認。TC-024 が appendOperatorEvent round-trip を確認すること。 |
| `src/cli/__tests__/command-registry-reopen.test.ts` | TC-012 が `--from` 不受理を assert すること。TC-025 が `REOPEN_USAGE` に `--from` option がないことを確認すること。 |
| `tests/unit/workflow/specrunner-dispatch.test.ts` | TC-019 が 2 コマンド順序（reopen → resume）を assert すること。 |
| `tests/unit/architecture/core-invariants.test.ts` | B-17 JSDoc が `awaiting-archive → awaiting-resume transition` に更新済み。liveness check が candidates.length > 0 で通ること。 |
| `architecture/conformance.md` | B-17 行に括弧書きで `awaiting-archive → awaiting-resume` のガード対象が記述されていること。 |
| `src/core/command/guide.ts` | escalation 節 § 3 が 2 ステップフロー（reopen → resume）を記述していること。`--from` が `job reopen` オプション欄に記載されていないこと。 |
| `test-cases.md` | TC-013（must: resume executes pipeline after reopen）の実装有無を確認。 |
| `verification-result.md` | build / typecheck / test / lint / changed-line-coverage 全フェーズの pass を確認。 |

## iter1 F-001 / F-002 の修正確認

**F-001**（TransitionOpts JSDoc の `prepare()` → `execute()` 修正）:

```ts
// lifecycle.ts 92 行（現在）
 * Must only be passed by ReopenCommand.execute() — never by resume or other callers.
```

✅ 正しく `execute()` を参照している。operator commit 6af009b0 で修正済み。

**F-002**（ワークフローヘッダーコメントの 2 段呼び出し記述）:

```yaml
# - reopen: ...
#           job reopen <slug> --reason <text>（lifecycle 巻き戻しのみ、commit を作らない）→
#           job resume <slug> --from <step> [--prompt <text>]（実行再開）の 2 段呼び出し。
```

✅ 新契約を正確に記述している。operator commit 6af009b0 で修正済み。

## 受け入れ基準の充足確認

| 受け入れ基準 | 確認結果 |
|---|---|
| awaiting-archive + OPEN PR → awaiting-resume、pipeline 不起動 | ✅ TC-001 / TC-002 実装済み。reopen.ts に CommandRunner 依存なし。 |
| merged/closed PR、archived/canceled job の拒否 | ✅ TC-003〜TC-007 実装済み。 |
| operator event と reason の保持 | ✅ TC-010 / TC-011 実装済み。invocationCallOrder で順序固定。 |
| reopen 後の resume による pipeline 再開 | ⚠ TC-013（must）が新規テストファイルに存在しない（F-003 参照）。 |
| resume --adopt-commits / --apply-canon が適用可能 | ✅ resume の既存契約は変更なし。既存 resume テストでカバー。 |
| ReopenCommand からの CommandRunner 依存除去 | ✅ TC-020 / TC-021 が `instanceof CommandRunner === false` および `"prepare" in cmd === false` を assert。 |
| local / managed / Actions の lifecycle/execution 整合 | ✅ workflow 更新済み。TC-019 / TC-R02 で検証。 |
| typecheck / test が green | ✅ verification-result.md: 全フェーズ exit 0。 |

## 検証できなかった項目

None。全検証対象を確認済み。

## Findings 詳細

### F-001 · MEDIUM · FIXABLE — state 解決 I/O エラー時の exit code が 2 になる

`src/core/command/reopen.ts` 112–115 行：

```ts
} catch (err) {
  logError((err as Error).message);
  return 2;  // <-- worktree guard 専用のコードを誤用
}
```

このキャッチブロックは、`resolveJobStateBySlug` / `JobStateStore.list` / `loadStateByJobId` のいずれかが I/O エラーで throw したときに実行される。

tasks.md T-02 acceptance criteria の exit code 契約：

> `execute()` returns `2` for worktree guard violations.
> `execute()` returns `1` for status gate, PR gate, missing PR, API failures.

State 解決 I/O エラーは `1` が正しい。`2` は worktree guard 専用であり、呼び出し元スクリプトが誤解する可能性がある（CI や wrapper スクリプトが exit 2 を "wrong environment" と判定する場合）。

**修正**: `return 2` → `return 1`

なお、この分岐をカバーするテストは現時点で存在しない（edge case）ため、機能的影響は限定的。同ファイル内の他のエラーパス（PR gate、API 失敗、store 解決失敗）はすべて正しく `1` を返している。

---

### F-002 · LOW · FIXABLE — `vi.mock("../../resume/resolve-job.js")` が重複宣言されている

`src/core/command/__tests__/reopen-command.test.ts` 30–32 行および 82–84 行に、同一モジュール・同一 factory の `vi.mock` 呼び出しが 2 箇所存在する：

```ts
// 30–32 行目
vi.mock("../../resume/resolve-job.js", () => ({
  resolveJobStateBySlug: vi.fn(),
}));

// 82–84 行目（重複）
vi.mock("../../resume/resolve-job.js", () => ({
  resolveJobStateBySlug: vi.fn(),
}));
```

vitest は `vi.mock` を hoist して deduplicate するため機能的影響はなく、全テストは green。コピーペーストの残骸と考えられる。後者（82–84 行目）を削除することで可読性が上がる。

---

### F-003 · LOW · DECISION-NEEDED — TC-013（must）が新規テストファイルに明示的に実装されていない

`test-cases.md` の TC-013「Resume executes the pipeline after reopen」は priority: must のテストケースだが、本 PR で追加・修正されたすべてのテストファイルに `TC-013` ラベルの実装が存在しない。

- tasks.md T-06 の実装リスト（`TC-001〜TC-011、TC-015、TC-020〜TC-021、TC-029〜TC-030`）に TC-013 が含まれていないため、実装者は tasks.md に従い意図的に省略している。
- 機能的カバレッジは `tests/unit/cli/resume.test.ts` の既存テスト「runs pipeline and returns exit code 0 when job is awaiting-resume」で担保されており、`awaiting-resume → running` の遷移は verification で green 確認済み。
- ただし、test-cases.md（must）と tasks.md（省略）の間に整合性がないことは残存する。

**options**:
- **A**: 現状の coverage（resume.test.ts の既存テストが TC-013 シナリオをカバー）を正式に acceptance とし、tasks.md T-06 に「TC-013 coverage: 既存 resume.test.ts を参照」の注記を追加する。
- **B**: `reopen-command.test.ts` または新規テストファイルに、`reopen → awaiting-resume → ResumeCommand.prepare() が awaiting-resume を受理する` を確認する TC-013 ラベルの明示的テストを追加する。

---

## ポジティブ観察点

- **ReopenCommand のデカップリングが多層で固定されている。** TC-020 の `instanceof CommandRunner === false` + `"prepare" in cmd === false` に加え、typecheck ゼロエラーと B-17 liveness check が独立したレイヤーで保証している。
- **appendOperatorEvent → persist の順序が `invocationCallOrder` でピン留めされている。** D6 durability の要件が vitest の呼び出し順 API で静的・動的の両方から確認できる。
- **Actions ワークフローの 2 段呼び出しが 2 つの独立したテストファイルから検証されている。** `specrunner-dispatch.test.ts`（TC-019-e: reopen index < resume index）と `dispatch-workflow-reopen-action.test.ts`（TC-R02: `job reopen` 行に `--from` が含まれないこと）が互いに独立した抽出ロジックで確認している。
- **fromStep optional 化の後方互換が TC-009-c で明示されている。** 旧レコード（fromStep あり）と新レコード（fromStep なし）の混在ジャーナルを `fold()` が正しく処理することを確認している。
- **F-001（exit code 2）の誤用は state 解決キャッチブロック 1 箇所のみ。** PR gate / status gate / API failures はすべて正しく `1` を返している。worktree guard の `2` は TC-029 でも確認されており、設計意図自体は実装されている。
