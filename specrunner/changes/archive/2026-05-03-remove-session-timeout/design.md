## Context

spec-runner は Anthropic Managed Agent の session を起点にパイプラインを駆動する。各 step の `pollUntilComplete` は固定 wall-clock timeout（既定 10 分、propose は 30 分）を持ち、超過すると `SESSION_TIMEOUT` で `error` 状態に遷移させる。実利用では (1) 長時間 implementer session が処理中でも abort される、(2) subprocess hang と区別がつかず正常 SDK 動作も timeout 扱いになる、(3) CLI 側 state と Anthropic 側の実 session に乖離が生じる、という 3 つの問題が観測されている（直近では PR #58 dogfooding-007 で実害化）。

session 終端の出口戦略は wall-clock timeout 以外に複数存在する:

- `streamEvents` の idle + end_turn 検知（正常完了）
- SSE disconnect → `terminated` flag → step 終了
- Anthropic SDK 側の `stop_reason: retries_exhausted` 等
- `maxIterations` 超過 → `*_RETRIES_EXHAUSTED` → escalation
- 手動 cancel（`canceled` status）

これらが healthy に機能している今、wall-clock timeout は冗長であり、むしろ誤動作の主因である。本 design はその撤廃方針と、既存ユーザーへの後方互換戦略を定義する。

## Goals / Non-Goals

**Goals:**

- step session に対する固定 wall-clock timeout を完全撤廃し、終端は出口戦略（idle+end_turn / SSE disconnect / stop_reason / maxIterations / 手動 cancel）に一本化する
- 旧 state file（`error.code === "SESSION_TIMEOUT"`）が破壊的変更にならない lazy migration を提供する
- 旧 config ファイルの `timeoutMs` / `timeout` キーを silently ignore して破壊しない
- 関連 6 spec（`propose-pipeline` / `session-completion-detection` / `spec-review-session` / `spec-fixer-session` / `job-state-store` / `cli-config-store`）から timeout 由来 Requirement / Scenario を削除し、`openspec validate --strict` を pass させる
- 既存テストの全 pass を維持する（変更前ベースライン比で減少なし。timeout 関連テスト削除分は除く）

**Non-Goals:**

- `doctor` の network/CLI check timeout（5s/30s）の撤廃 — UX のための fast-fail で session 暴走防止とは目的が異なる
- `Custom Tool Handler` の handler 内 timeout の撤廃 — ローカル handler 用、別軸
- Anthropic SDK 内部の HTTP 単位 timeout の干渉 — SDK 側で管理
- propose agent の system prompt deploy gap 是正（別 request）
- `archive-openspec.ts` の `-y` flag 対応（別 request）
- top-level timeout config のキー名変更 — 削除はするが代替リネームは行わない

## Decisions

### D1. wall-clock timeout を完全削除する（vs. 上限値だけ大きくする / opt-in 化）

`StepExecutor.getTimeoutMs` 自体を削除し、`pollUntilComplete` の `timeoutMs` オプションを SDK ラッパーから除去する。

**Rationale:** 「上限を 60 分に伸ばす」「設定で無効化可能にする」案も検討したが、(1) 現状の出口戦略で session 終端は健全に検知できており timeout は冗長、(2) opt-in だと既存ユーザーの誤設定で同じ障害が再発する、(3) コード側で `timeoutMs` を残すと型分岐 / テスト分岐が残り保守負債になる、ため完全削除を選ぶ。doctor / Custom Tool Handler / SDK 内部の timeout は本 request 対象外として分離する。

### D2. `SESSION_TIMEOUT` error code は型システムから除去し、旧 state は読み取り時 lazy migration

`ERROR_CODES.SESSION_TIMEOUT` 定義と `sessionTimeoutError` ヘルパーを削除する。`state.error.code` 列挙 (`job-state-store` spec) からも除外する。旧 state file 互換性は `validateJobState` で `state.error.code === "SESSION_TIMEOUT"` を `SESSION_TERMINATED` に書き換えることで担保する。

**Rationale:** 旧 state を完全 reject すると resume が壊れる。新規書き込み禁止 + 読み取り時 mapping で「型は新しく、ファイルは寛容に」を実現する。`SESSION_TERMINATED` を選ぶ理由は、それが「terminal な失敗・resume 不可」という意味で最も意味的に近いから（`session-completion-detection` spec 既存定義）。書き戻しは次回 `JobStateStore.update()` 時に lazy 反映され、明示的な migration バッチは不要。

**Alternative considered:** 専用 `SESSION_TIMEOUT_LEGACY` コードを残す案 → 列挙肥大化と互換コード残存のため却下。

### D3. config の `timeoutMs` / `timeout` は silently ignore、warn しない

`SpecRunnerConfig.specReview.timeoutMs` / `SpecRunnerConfig.specFixer.timeoutMs` / top-level `timeout` を schema から削除する。読み取り時に余分キーが存在しても warn せず無視し、書き込み時には出力しない。

**Rationale:** warn を出すと既存ユーザーの CI/初回起動に余計なノイズが入り、本 request の本質（timeout 撤廃）と直交する UX 劣化になる。silently ignore で「壊さないが将来的に消える」を実現する。`cli-config-store` spec の Requirement 「top-level timeout config はキー変換せず別軸として維持される」は本 request で削除する。

**Alternative considered:** deprecation warn を 1 回だけ出す案 → init / status / run の各経路で warn 出す箇所が分散しコスト高、かつユーザー体験的にもメリット少のため却下。

### D4. delta spec は MODIFIED + REMOVED の組み合わせで構成

6 spec のうち、Requirement 全体を削除するもの（`session-completion-detection`「完了タイムアウトを実装する」、`spec-review-session`「spec-review セッションは独立した timeout を持つ」、`spec-fixer-session`「spec-fixer セッションは独立した timeout を持つ」、`cli-config-store`「top-level timeout config はキー変換せず別軸として維持される」）は `## REMOVED Requirements` で扱う。Requirement は維持しつつ Scenario / 表行を削るもの（`propose-pipeline`「パイプライン失敗遷移は固定の history entry と status で記録する」、`job-state-store`「`state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` は retry 上限到達を示す」周辺）は `## MODIFIED Requirements` で本文全体を再掲する（review-standards.md の MODIFIED ルールに従い、Requirement header は main spec と完全一致させる）。RENAMED は本 request では発生しない。

**Rationale:** Requirement ごと消えるものを MODIFIED で空文に書き換えると意味的に不正確かつ archive 時に header mismatch を起こすリスクがある。明確に REMOVED + Reason / Migration を書く方が後続 archive と spec-reviewer のレビューに優しい。

## Risks / Trade-offs

- **[Risk] 真に hang した session が無限 polling される** → Mitigation: SSE disconnect 検知 / `terminated` 観測 / Anthropic SDK 側の `stop_reason` で大半は終端する。残り（SDK が hang したまま正常応答を返さないケース）は手動 `specrunner cancel` で終端させる。手動 cancel の運用が UX 上必要なら別 request で `--max-duration` flag のような明示的な opt-in を再検討する余地は残る。
  - **[Out of scope but tracked #1]** `specrunner cancel <jobId>` が in-flight session を `canceled` 状態に遷移できることの smoke test 追加 — 本 request では acceptance 基準に含めないが、次 request で対応を推奨する
  - **[Out of scope but tracked #2]** 長時間 session（例: 30 分以上経過）の elapsed time を `specrunner status` / `ps` 上で可視化する UX 改善 — コスト超過・CI 暴走の検知経路として有効。本 request の scope 外とし、将来の `--max-duration` opt-in 検討時に併せて設計する
- **[Risk] CI 環境でジョブが何時間も走り続けコスト超過** → Mitigation: 出口戦略 (`maxIterations` 等) は健在。CI コスト保護は本 request の責務外（CI 側 wall-clock timeout で外側から防護する）
- **[Risk] 旧 state file に書き戻しが起きないまま長期残留する** → Mitigation: lazy migration で読み取り時には正常動作する。書き戻しは次回 update（resume / cancel / status 表示時の touch）で自然に発生する。`SESSION_TIMEOUT` 文字列の grep 監査は `JobStateStore.update()` 経路で消える設計
- **[Trade-off] config の余分 `timeoutMs` を silently 無視するため、ユーザーが「timeout が効かないのはなぜか」と気づかない可能性** → Mitigation: CHANGELOG / release notes での明示。本 request の delta spec 自体が監査ログとして機能する
- **[Risk] timeout 関連 unit テスト削除時に regression を見落とす** → Mitigation: 受け入れ基準「既存テスト全件 PASS（変更前ベースライン比で減少なし、timeout 関連テスト削除分を除く）」を verification phase で必ず回す。タスクで `grep -r SESSION_TIMEOUT src/ tests/` を実施し残存ゼロを確認

## Migration Plan

1. **コード変更を先に入れる**:
   - `ERROR_CODES.SESSION_TIMEOUT` 削除前に `src/state/schema.ts`（`validateJobState` 実体）の lazy mapping を追加
   - `src/core/step/executor.ts` の `StepExecutor.getTimeoutMs` 削除、`pollUntilComplete` 呼び出しから `timeoutMs` 除去を同時 commit
   - `src/config/schema.ts` の `getTimeoutMs(stepName, cfg)` ヘルパー削除を同時 commit
   - `src/adapter/anthropic/session-runner.ts`（lines 99, 116）と `src/adapter/anthropic/completion.ts:74` の `timeoutMs` 引数・`SESSION_TIMEOUT` フォールバック削除を同時 commit
2. **state file lazy migration の検証**: 旧 state fixture（`error.code === "SESSION_TIMEOUT"`）を読み込んで `SESSION_TERMINATED` にマップされる unit test を追加
3. **config 後方互換の検証**: 旧 config fixture（`specReview.timeoutMs` 入り）を `ConfigStore.load()` し例外なく読み取り、`save()` 後のファイルに当該キーが含まれないことを確認するテスト追加
4. **テスト整理**: timeout 由来テスト（`SESSION_TIMEOUT` を expect しているケース）を削除または書き換え。`grep -r SESSION_TIMEOUT` で残存ゼロにする
5. **spec 更新と validate**: 6 spec の delta を作成し `openspec validate remove-session-timeout --type change --strict` で pass（`message-streaming` は scope 外・変更なし）
6. **rollback strategy**: `SESSION_TIMEOUT` の復活は (a) `ERROR_CODES` の再追加、(b) `validateJobState` の lazy mapping 削除、(c) `pollUntilComplete` の `timeoutMs` 再導入で可能。lazy migration により旧 state は復活後も読み続けられる

## Open Questions

- なし（要件は request.md 受け入れ基準で確定済み。実装時に新たな分岐が判明したら spec-fixer ループで対応）
