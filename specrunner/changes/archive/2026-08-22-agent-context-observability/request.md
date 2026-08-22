# agent session の active context / compaction を計測可能にする

## Meta

- **type**: new-feature
- **slug**: agent-context-observability
- **base-branch**: main
- **adr**: false

## 背景

#1058 では、`implementer` が Claude Code SDK の `Prompt is too long` で停止し、ephemeral runner 上の未commit成果が失われた。

現在の SpecRunner は `ModelUsage` として次を記録している。

- `inputTokens`
- `outputTokens`
- `cacheReadInputTokens`
- `cacheCreationInputTokens`

Claude Code では加えて `numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` も取得している。

しかし、これらは invocation の利用量・累計であり、**その時点で agent session が実際に何 token の active context を保持していたか**を表さない。

そのため現状では、

- 100k 付近で compact すべきか
- 200k〜300k まで保持した方が効率的か
- provider native compaction がいつ発火したか
- context exhaustion が何 token 付近で発生したか

を SpecRunner の実測から判断できない。

固定閾値を先に決めず、まず context lifecycle を観測可能にする。

## 目的

agent invocation / session について、provider が提供できる範囲で active context と compaction の実測値を記録し、#1058 の rollover / compaction 方針をデータで決められるようにする。

## 要件

### 1. active context と累計 usage を区別する

既存 `ModelUsage` の累計値を active context size として扱わない。

provider から現在の request / session context size を取得または正当に算出できる場合のみ、明示的な context metric として記録する。

取得不能な provider / SDK では `undefined` / unavailable とし、累計 token usage から推測値を捏造しない。

### 2. context lifecycle metrics を記録する

取得可能な範囲で、少なくとも次の観測値を表現できるようにする。

- `contextWindowTokens`: その invocation で認識された context window
- `peakActiveContextTokens`: 観測できた active context の最大値
- `compactionCount`: 観測できた compaction 回数
- `contextTokensBeforeCompaction`: compaction 直前の context size
- `contextTokensAfterCompaction`: compaction 直後の context size
- `exhaustionAtTokens`: context exhaustion 発生時に観測できた context size

値を取得できない項目は optional とする。

### 3. provider-native の事実を優先する

Claude / Codex で context や compaction の通知方法が異なることを前提とする。

- provider SDK / stream event / result が明示的に返す値を優先する
- adapter が provider 固有情報を provider-neutral metric へ変換する
- provider 固有の閾値や compaction policy を core に固定しない

### 4. 既存 usage / invocation metrics と同じ観測経路に残す

context metrics は session log だけに閉じず、job 完了後に比較・集計できる永続データとして残す。

既存の usage / invocation metrics の責務を不用意に重複させず、どの永続形式へ載せるかは現行構造に合わせて最小変更で決める。

## 受け入れ条件

- [ ] 累計 `ModelUsage` と active context metric が意味上・型上区別される
- [ ] provider が active context size を報告できる場合、invocation 中の peak を記録できる
- [ ] provider が compaction を報告できる場合、回数と before / after context size を記録できる
- [ ] context exhaustion 時、取得可能なら exhaustion 時点の context size が残る
- [ ] context size を取得できない provider では値を捏造せず unavailable として扱う
- [ ] job 完了後に step / model / provider 単位で context metrics を確認できる
- [ ] 既存 `ModelUsage` / cost 集計の意味を変更しない
- [ ] Claude / Codex adapter のどちらか一方の仕様を core 契約として固定しない
- [ ] typecheck / test green

## スコープ外

- compact / rollover を何 token で発火するかの閾値決定
- SpecRunner 独自 compaction の実装
- fresh session rollover 本体（#1058）
- pipeline step の追加・分割
- provider native compaction policy の上書き

## #1058 との関係

#1058 の本質は context exhaustion で work を失わないことなので、exhaustion 時の fresh session rollover は本 Issue を待たずに成立する。

一方、通常時に proactive compact / rollover を何 token で行うかは、本 Issue の観測結果を見てから決める。

まず `Prompt is too long` が実際に何 token 付近で起きたのか、通常の implementer / fixer がどこまで active context を伸ばしているのかを見えるようにする。