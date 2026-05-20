# assertJobFinishable の hint を未実装コマンドではなく actionable な fallback に書き換える

## Meta

- **type**: bug-fix
- **slug**: finish-hint-actionable-fallback
- **base-branch**: main
- **adr**: false

## 背景

`src/core/finish/job-state-update.ts:17-18` で `failed` / `terminated` 状態の job に対する `specrunner finish` の hint に「`specrunner cancel` を使え」と書かれているが、**cancel コマンドはまだ実装されていない**。

```
$ bun ./bin/specrunner.ts cancel
Unknown command: cancel
```

結果として、ユーザーは:
1. `JOB_NOT_FINISHABLE` エラーを受け取る
2. hint に従って `specrunner cancel` を実行
3. `Unknown command: cancel` が返る
4. 何をすればよいか分からなくなる (= UX 上の dead-end)

issue #73 で MEDIUM finding として指摘済。

## 思想

未実装のコマンドにユーザーを誘導しない。`failed` / `terminated` job を抜け出す **実装済の手順** (= 既存 `specrunner rm <jobId>` が `ALLOWED_STATUSES = {failed, terminated, archived}` で許可済) を hint で案内する。

## 要件

### 1. hint message の書き換え (= `STATUS_HINTS`)

`src/core/finish/job-state-update.ts` の `STATUS_HINTS` で `failed` / `terminated` の hint を以下のように書き換える:

```ts
failed: "Run 'specrunner rm <jobId>' to remove the failed job.",
terminated: "Run 'specrunner rm <jobId>' to remove the terminated job.",
```

`specrunner rm` は既に `src/core/rm/runner.ts:37` の `ALLOWED_STATUSES` で `failed` / `terminated` を許可済 = 実装済の正規経路。

### 2. `errors.ts` の `pollTimeoutError` も同時修正

`src/errors.ts:226` の `pollTimeoutError` hint も `specrunner cancel` を案内しているが同様に未実装。

```ts
// 現状: "Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner cancel' to abort."
// 修正: "Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner rm <jobId>' to abort."
```

本 request 内で同 scope として修正する (= 「未実装コマンドへの誘導」を構造的に解消)。

### 3. 「未実装コマンドへ誘導しない」原則の test 化

hint message 内に登場する `specrunner <command>` が `COMMANDS` registry に存在することを assertion する unit test を追加する (= 将来同型バグを構造的に catch、`feedback_avoid_patchwork`)。

検査対象は以下に限定する:

- `src/core/finish/job-state-update.ts` の `STATUS_HINTS` の全エントリ
- `src/errors.ts` の `SpecRunnerError` の `hint` 引数を持つ factory 関数群 (= `pollTimeoutError` 等)

`SpecRunnerError` 系のすべての hint を網羅するのが望ましいが、検査範囲は「hint 文字列内の `specrunner <verb>` パターンを正規表現で抽出し、抽出した verb が `COMMANDS` registry のキーに含まれるか」で判定する。

### 4. 既存テストの調整

hint 文字列を **直接 assert している** 既存テスト (= 例: `tests/finish-job-state.test.ts` 等、対象は実装時に grep で特定) のみ新 hint に合わせて update する。`SpecRunnerError.message` (= 第 3 引数の cause message) を assert しているテストは hint 変更の影響を受けないため touch しない。

## スコープ外

- `specrunner cancel` コマンド自体の実装 (= 別 issue、ロードマップ上の機能追加)
- 他の hint message の見直し (= `running` / `awaiting-resume` / `canceled` の hint は現状動くコマンドを案内しており修正不要)
- state file 削除 CLI の追加 (= `specrunner rm <jobId>` が既存、`specrunner job rm` 系への整理は #295 のスコープ)
- 全 `SpecRunnerError` factory の hint 監査 (= 本 request の test は `STATUS_HINTS` + 既知の `cancel` 参照箇所に限定、網羅監査は別議論)

## 受け入れ基準

- [ ] `STATUS_HINTS["failed"]` および `STATUS_HINTS["terminated"]` が `specrunner cancel` を案内せず、`specrunner rm <jobId>` を案内する内容に書き換わっている
- [ ] `src/errors.ts` の `pollTimeoutError` の hint が `specrunner cancel` を案内せず、`specrunner rm <jobId>` を案内する内容に書き換わっている
- [ ] hint 文字列内に登場する `specrunner <command>` が `COMMANDS` registry に存在することを assertion する unit test が追加されている (= 検査対象: `STATUS_HINTS` の全エントリ + `pollTimeoutError`)
- [ ] hint 文字列を直接 assert している既存テスト (= 該当ファイルは実装時に grep で特定) のみ新 hint で update され green
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
