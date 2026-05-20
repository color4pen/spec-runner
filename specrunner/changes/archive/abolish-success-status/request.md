# `success` JobStatus を撤廃し `awaiting-merge` に置き換える

## Meta

- **slug**: abolish-success-status
- **type**: refactor
- **date**: 2026-05-03
- **author**: color4pen
- **related**: PR #67 (`executor.ts:195` の status 誤書込みを露出させた dogfooding), PR #68 (verification propagation 修正)

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

現状 `JobStatus` は `"running" | "success" | "failed" | "terminated" | "archived"` で定義されているが、`"success"` 値が以下の 2 種類の事象に二重に当てられている:

1. **step 単位の OK**: `executor.ts:195` / `executor.ts:733` が review-style step の verdict parse 直後に無条件で `status: "success"` を job-level に書き込む
2. **pipeline 終端の OK**: `executor.ts:411` が pipeline 全体の終端到達時に `status: "success"` を書く

この二重性により `cli/run.ts:184` の `if (finalState.status === "success") "Pipeline completed successfully"` が誤発火する。具体的には verification iter 1 や spec-review approved の直後に「`status="success"` だけど pipeline は continuation 中」という状態が成立し、retries exhausted で escalation した case でも CLI が「成功」と誤報する。

加えて `assertJobFinishable` のガードが `status === "running"` だけ reject する設計のため、`failed` / `terminated` の job も finish 経由で archived に書き換えられてしまう（失敗履歴の喪失）。

仕様は既に `awaiting-merge` を JobStatus 値として前提にしている (`openspec/specs/cli-finish-command/spec.md` の note: "awaiting-merge is a JobStatus value (not a filesystem dir)")。実装が後追いで揃っていない drift。

## 目的

`success` JobStatus を撤廃し、pipeline lifecycle の各 phase に対応する明確な status 値に再設計する。spec の既存 note と実装を整合させ、`executor.ts` の誤書込みと CLI の誤報を同時に解消する。

## 要件

1. **schema 変更** — `src/state/schema.ts` の `JobStatus` を以下に変更する:
   ```ts
   export type JobStatus =
     | "running"           // pipeline 実行中
     | "awaiting-merge"    // pipeline 完了 + PR 作成、finish 待ち
     | "failed"            // 回復不能エラー
     | "terminated"        // 外部要因 session 終了
     | "archived"          // finish 完了
   ```
   `success` は削除。

2. **pipeline 終端の status 書込みを変更** — `src/core/step/executor.ts:411` の pipeline-end success 書込みを `status: "awaiting-merge"` に変更する。

3. **step verdict parse 後の status 誤書込みを除去** — `src/core/step/executor.ts:195` および `:733` の `state = await store.update(state, { status: "success" })` 行を削除する。step 完了は `state.steps[stepName]` への append で表現し、job-level status は `running` のまま据え置く。

4. **CLI 完了判定の更新** — `src/cli/run.ts:184` の `if (finalState.status === "success")` を `if (finalState.status === "awaiting-merge")` に変更する。完了メッセージも「Pipeline completed; awaiting merge.」等に更新する。

5. **`assertJobFinishable` の guard 強化** — `src/core/finish/job-state-update.ts:17-25` を以下に変更:
   - `status === "awaiting-merge"` のみ通す（順方向の通常 case）
   - `status === "running"` は `JOB_NOT_FINISHABLE`
   - `status === "failed"` / `"terminated"` は `JOB_NOT_FINISHABLE` の別 hint で reject（cancel 経路を案内）
   - `status === "archived"` は idempotent skip（既存の TC-126 の挙動を維持）

6. **後方互換 layer** — `src/state/store.ts` の state file 読み込み時、legacy `status: "success"` を読んだ場合は `"awaiting-merge"` にマップする 1-time migration を実装する。state file 自体は次の `updateJobState` で新値に上書きされる。1-2 release 後に削除予定。

7. **handleExhausted の status 変更** — `src/core/pipeline/pipeline.ts:303` の `handleExhausted` が `status` を上書きしない現状仕様を変更し、retries exhausted 時に `status: "failed"` を書くようにする。`error.code` は既存の `*_RETRIES_EXHAUSTED` を維持。

8. **テスト更新** — 影響を受ける既存テストを更新:
   - TC-029 `success → status: "archived"` を `awaiting-merge → archived` に変更（legacy `success → archived` の互換テストを別途追加）
   - TC-031 `assertJobFinishable` の引数を `awaiting-merge` 中心に変更
   - `cli/run.ts` の Pipeline completed 判定テスト
   - `executor.ts:195/733` の status 書込み除去を確認する regression テスト追加

9. **ADR** — abolish の判断（`success` を撤廃するか alias として残すか、`failed` を finish-able にしないかの判断、後方互換 layer の TTL 等）を ADR に記録する。

## 受け入れ基準

- [ ] `JobStatus` 型から `"success"` が消えている
- [ ] `JobStatus` 型に `"awaiting-merge"` が追加されている
- [ ] `executor.ts` 内に `status: "success"` の書込みが 1 箇所も残っていない
- [ ] `executor.ts` の pipeline-end 書込みが `status: "awaiting-merge"` になっている
- [ ] `cli/run.ts:184` の判定が `awaiting-merge` ベースに更新されている
- [ ] `assertJobFinishable` が `awaiting-merge` のみ通し `failed` / `terminated` を reject する
- [ ] `handleExhausted` が retries exhausted 時に `status: "failed"` を書く
- [ ] legacy `status: "success"` の state file を読んでも crash せず `awaiting-merge` にマップされて読める
- [ ] 既存 archived 状態の job が `archived → archived` で idempotent に finish 可能（TC-126 維持）
- [ ] `bun run typecheck` / `bun run lint` / `bun run test` が全 pass
- [ ] ADR が `openspec-workflow/adr/` 配下に追加されている

## 補足

- 今回の change で `successful` という単語が docs / system prompt 等に残っているのは scope 外。検索で出てくる範囲は別途 chore で対応。
- spec 改定は不要（`openspec/specs/cli-finish-command/spec.md` 等に既に `awaiting-merge` の言及あり）。spec → 実装 の drift を実装側で解消する change。
- `cancel` 経路は本 change の scope 外。`failed` / `terminated` job の archive 不可化により `specrunner cancel` が必要になる場面が増える可能性はあるが、実装は別 change。

## scope 外（別 change で扱う）

- `executor.ts:411` の pipeline-end 書込みが正しい場所か（pr-create step の後? code-review approved の後?）の議論
- `awaiting-merge` 状態の visualization（`ps` の表示色など UX）
- legacy `success` 後方互換 layer の削除タイミング
- `failed` job の cancel 経路の整備


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/abolish-success-status.md` by `merged-to-archive-consolidation`.
