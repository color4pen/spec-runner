# Remove Wall-Clock Timeout from Step Sessions

**Date**: 2026-05-03
**Status**: accepted

## Context

spec-runner は Anthropic Managed Agent の session を起点にパイプラインを駆動する。各 step の `pollUntilComplete` は固定 wall-clock timeout（既定 10 分、propose は 30 分）を持ち、超過すると `SESSION_TIMEOUT` で `error` 状態に遷移させる設計だった。

実利用では (1) 長時間 implementer session が処理中でも abort される、(2) subprocess hang と区別がつかず正常 SDK 動作も timeout 扱いになる、(3) CLI 側 state と Anthropic 側の実 session に乖離が生じる、という 3 つの問題が観測された（直近では PR #58 dogfooding-007 で実害化）。

session 終端の出口戦略は wall-clock timeout 以外に `streamEvents` の idle + end_turn 検知 / SSE disconnect / SDK の `stop_reason` / `maxIterations` 超過 / 手動 cancel の 5 経路が既に healthy に機能しており、wall-clock timeout は冗長かつ誤動作の主因である。

## Decision

step session の固定 wall-clock timeout を完全撤廃し、終端は出口戦略（idle+end_turn / SSE disconnect / stop_reason / maxIterations / 手動 cancel）に一本化する。`SESSION_TIMEOUT` error code は型システムから除去し、旧 state file は読み取り時 lazy migration で `SESSION_TERMINATED` にマップする。config の `timeoutMs` / `timeout` キーは silently ignore する。delta spec は REMOVED + MODIFIED の組み合わせで構成する。

## Alternatives Considered

### Alternative 1: 上限値だけ大きくする（例: 60 分）/ opt-in 化

- **Pros**: 既存 API 互換、最小変更、CI 暴走時の最終防護線が残る
- **Cons**: 出口戦略で session 終端は健全に検知できているため timeout は冗長 / opt-in だと既存ユーザーの誤設定で同じ障害が再発 / コード側で `timeoutMs` を残すと型分岐 / テスト分岐が残り保守負債
- **Why not**: 現状の根本問題（subprocess hang と SDK 正常動作の混同）を解決せず、フラグや上限値の調整は対症療法にとどまる

### Alternative 2: `SESSION_TIMEOUT_LEGACY` 専用コードを残し旧 state を識別保持

- **Pros**: 旧 state の意味が型レベルで残り、analytics / debug 時に区別可能
- **Cons**: error code 列挙が肥大化し、互換コードが恒久的に残る
- **Why not**: 列挙肥大化と互換コード残存のコストに対して便益が小さく、`SESSION_TERMINATED`（terminal な失敗・resume 不可）への mapping で意味的にも十分

### Alternative 3: `timeoutMs` config 削除時に deprecation warn を 1 回出す

- **Pros**: ユーザーが削除されたキーに気づける
- **Cons**: init / status / run の各経路で warn 出す箇所が分散しコスト高 / CI 初回起動に余計なノイズ / 本 request の本質（timeout 撤廃）と直交する UX 劣化
- **Why not**: silently ignore で「壊さないが将来的に消える」を実現する方が UX 的に優位。CHANGELOG / release notes での明示で十分

### Alternative 4: 全 spec を MODIFIED で空 Requirement に書き換える

- **Pros**: 削除と追加の両方の意図を 1 セクションで表現できる
- **Cons**: Requirement ごと消えるものを MODIFIED で空文に書き換えると意味的に不正確 / archive 時に header mismatch を起こすリスク
- **Why not**: REMOVED + Reason / Migration を明示する方が後続 archive と spec-reviewer のレビューに優しい

## Consequences

### Positive

- 長時間 implementer session が wall-clock で誤打ち切りされない
- subprocess hang と SDK 正常動作の区別がつき、誤った abort が消える
- CLI 側 state と Anthropic 側の実 session の乖離が解消される
- `timeoutMs` 関連の型分岐 / テスト分岐 / config schema が消え、保守負債が削減される
- 旧 state file は lazy migration により破壊的変更にならず、resume 経路も維持される
- 旧 config の `timeoutMs` / `timeout` を silently ignore するため、CI / 初回起動に余計な警告ノイズが入らない
- delta spec の REMOVED / MODIFIED 使い分けにより、archive 時の spec 履歴が監査ログとして機能する

### Negative

- 真に hang した session の自動検知経路が失われる（出口戦略以外の最終防護線が無くなる）
- ユーザーが `timeoutMs` config を書いても効かないことに気づきにくい（warn なし）
- CI 環境でジョブが何時間も走り続けコスト超過するリスクは外側（CI 側 wall-clock）で防護する必要がある

### Risks

- **真に hang した session が無限 polling される** → SSE disconnect 検知 / `terminated` 観測 / SDK の `stop_reason` で大半は終端する。残りは手動 `specrunner cancel` で終端させる。手動 cancel の運用が UX 上必要なら別 request で `--max-duration` flag のような明示的な opt-in を再検討する余地は残る
- **CI 環境でのコスト超過** → 出口戦略 (`maxIterations` 等) は健在。CI コスト保護は CI 側 wall-clock timeout で外側から防護する責務分担とする
- **旧 state file に書き戻しが起きないまま長期残留する** → lazy migration で読み取り時には正常動作する。書き戻しは次回 update（resume / cancel / status 表示時の touch）で自然に発生
- **timeout 関連 unit テスト削除時に regression を見落とす** → 受け入れ基準「既存テスト全件 PASS（変更前ベースライン比で減少なし）」を verification phase で必ず回し、`grep -r SESSION_TIMEOUT src/ tests/` で残存ゼロを確認

### Known Design Debt

- **`specrunner cancel <jobId>` smoke test 未整備**（design Risks "Out of scope but tracked #1"）— in-flight session を `canceled` 状態に遷移できることの検証が無い。本 request の acceptance 基準には含めず、次 request で対応推奨
- **長時間 session の elapsed time 可視化 UX 欠如**（design Risks "Out of scope but tracked #2"）— `specrunner status` / `ps` 上で経過時間が見えないため、コスト超過 / CI 暴走の早期検知経路が弱い。将来の `--max-duration` opt-in 検討時に併せて設計
- **`SpecFixerConfig._placeholder?: never` marker の暫定残置**（review-feedback-002.md Finding #1, LOW）— interface が空同然のため `_placeholder?: never` で型レベル marker 化したが、本質的には次回 SpecFixer 用 per-step option 追加時に削除すべき暫定処置。規律として「per-step option 追加時に併せて `_placeholder` を removal する」を維持
- **`message-streaming` no-op delta の存在**（spec-review-result-002.md Finding #1, LOW）— main spec と完全一致する no-op MODIFIED delta が残り、archive 時に意味のある spec 履歴が残らない。post-merge fixup または次 request で削除または scope 外注記の追加を推奨
- **`pollIntervalMs` の扱い分岐**（spec-review-result-002.md Finding #3, LOW）— schema 残置 (tagged optional) を default 推奨としたが、tasks 上は実装者選択の余地を残している。次回 cli-config-store 改修時に統一規律を確立

## Related

- Request: `openspec-workflow/requests/active/remove-session-timeout/request.md`
- Change: `openspec/changes/remove-session-timeout/`（design.md D1-D4）
- Spec deltas: `propose-pipeline` / `session-completion-detection` / `spec-review-session` / `spec-fixer-session` / `job-state-store` / `cli-config-store`
- Trigger incident: PR #58 dogfooding-007 implementer-timeout
