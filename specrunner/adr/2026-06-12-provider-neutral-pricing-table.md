# Provider 中立な pricing テーブル：純粋関数維持・registry invariant・config 層へのデフォルトモデル集約

**Date**: 2026-06-12
**Status**: accepted

## Context

`src/core/usage/pricing.ts` の `MODEL_PRICING` テーブルは Claude 系モデルのみを収録しており、OpenAI / Codex 系モデルの cost が `$?`（null）になっていた。Codex 移行後は全 step がこの状態になり、`specrunner usage` / `specrunner job show` の step 別 cost 表示が事実上失われる。

一方、`src/config/model-registry.ts` の `BUILTIN_MODEL_REGISTRY` には OpenAI 系モデル（`o3` / `gpt-5.x` / `gpt-5.x-codex`）が既に provider 付きで登録されているが、pricing テーブルとは独立しており key 集合が drift していた。

`computeCostUsd` / `lookupPricing` は `usage-summary.ts` と `job-show.ts` の複数 surface から config なしで呼ばれる純粋関数である。また `src/adapter/claude-code/query-one-shot.ts` は one-shot のデフォルトモデルとして provider 固有のリテラル `"claude-sonnet-4-5"` をインラインに持ち、`src/core/port/one-shot-query-client.ts` の doc コメントにも重複していた。

## Decision

### D1: OpenAI / Codex の単価は静的 `MODEL_PRICING` テーブルへ追加し、cost 関数は純粋なまま維持する

単価の置き場として 3 候補を検討し、**静的テーブルへの追加**を採用する。`computeCostUsd` / `lookupPricing` のシグネチャは変えず、config も model registry も注入しない。

**Rationale**:

- `computeCostUsd` / `lookupPricing` は config なしで呼ばれる pure 関数。registry（config 由来）へ統合すると全 cost 計算呼び出し点へ config を引き回す大きな ripple が発生し、利得がない。
- 責務分離: model registry は「runtime dispatch のための provider 解決」、pricing は「表示時の単価換算」。別軸の関心事であり統合すると単一責務が崩れる。
- 静的テーブルは既存の確立されたパターン（Claude 単価も出典・"as of" 付きの静的近似）。OpenAI エントリの追加はこのパターンの踏襲である。
- minimal-deps 原則: 外部依存ゼロ・config 不要のまま要件を満たせる。

### D2: `BUILTIN_MODEL_REGISTRY` の全モデルが単価を持つことを invariant とし、テストで固定する

**`BUILTIN_MODEL_REGISTRY` の key 集合 ⊆ `lookupPricing()` で非 `null` に解決される key 集合**を invariant とし、drift guard テストで継続的に検証する。

**Rationale**:

- registry にモデルを追加して単価を入れ忘れた場合に CI が drift を検知し、本 request が修正した不具合クラスの再発を防ぐ。
- 代表 1 モデルだけの検証では Codex 移行で使う他モデルが `$?` のまま残るリスクが消えない。網羅的な invariant が必要。

### D3: OpenAI 系の単価は `ModelPricing` の 4 軸で表現し、`cacheWrite` を `0` とする

`ModelPricing` の型（`input` / `output` / `cacheRead` / `cacheWrite`）と cost 計算式は変更しない。OpenAI 系には「cache write 課金」概念がないため、`cacheRead` に cached-input 単価を割り当て、`cacheWrite` は `0` とする。

**Rationale**:

- codex adapter は `cached_input_tokens → cacheReadInputTokens`、`cacheCreationInputTokens → 0` を写す（`agent-runner.ts`）。`cacheWrite: 0` は常に 0 token に乗算されるため cost に寄与しない。
- `cacheWrite: 0` は「この provider に cache write 課金が無い」ことをデータとして表し、幻の単価を匂わせない。
- OpenAI 用に別 interface を導入すると型分岐が cost 計算式へ波及し複雑化する。4 軸 + `cacheWrite: 0` で十分かつ最小。

### D4: one-shot デフォルトモデルを `DEFAULT_ONE_SHOT_MODEL` 定数に集約し、config 層が所有する

`query-one-shot.ts` のインラインリテラル `opts.model ?? "claude-sonnet-4-5"` を、`src/config/model-registry.ts` に新設した `DEFAULT_ONE_SHOT_MODEL` へ置換する。実際の解決は `getStepExecutionConfig` のチェーンを通り、`config.steps.defaults.model` が存在すればそれが勝つ。リテラルは「config が何も与えない場合の最終フォールバック」としてのみ機能し、adapter・ポートの doc コメントも定数参照へ更新する。

**Rationale**:

- config 経由の解決への統一 = デフォルトを adapter ローカルの散在リテラルではなく config 所有の単一ソースにすること。
- モデルに関する権威を config 層へ集約するため置き場を `config/model-registry.ts` とする（`init.ts` の独自デフォルトとは独立に扱う）。
- config 不在時に throw する案は zero-config 利用と既存テストを壊すため不採用。`init.ts` のデフォルトと統合して単一値にする案は one-shot のデフォルト値変更となり scope 拡大になるため不採用。

## Alternatives Considered

### Alternative 1: model registry に `pricing` フィールドを統合する（D1）

`ModelEntry` に単価を持たせ、`computeCostUsd` が merged registry を参照する案。

- **Pros**: registry と pricing の key drift が構造的に発生しない
- **Cons**: `computeCostUsd` が merged registry（config 依存）を要し、純粋関数性と複数 surface の呼び出し容易性を失う。全 cost 計算呼び出し点への config 引き回しという大きな ripple が発生する
- **Why not**: 責務分離（registry は runtime dispatch、pricing は表示時換算）と pure 関数維持を優先する（D1）

### Alternative 2: `config.models[name].pricing` で単価を上書き可能にする（D1）

config に単価フィールドを追加し、動的に上書きできる案。

- **Pros**: provider ごとの単価変動に config で追従できる
- **Cons**: 設定可変な単価は「課金レポートの新機能」であり現時点で実需がなく YAGNI。config を受け取らない pure 関数性も失う
- **Why not**: minimal-deps 原則と整合しない。実需が出た時点で別 request とする（D1）

### Alternative 3: 代表 1 モデルのみ非 `null` を検証する（D2）

drift guard テストの対象を代表モデル 1 件に絞る案。

- **Pros**: テストの記述量が最小
- **Cons**: Codex 移行で使う他モデルが `$?` のまま残るリスクが消えない。registry に新モデルを追加して単価を入れ忘れた場合に CI が検知できず、本 request が修正した不具合クラスが再発する
- **Why not**: 不具合クラス（registry/pricing の drift）を防ぐためには `BUILTIN_MODEL_REGISTRY` 全モデルの網羅的な invariant が必要（D2）

### Alternative 4: OpenAI 用に別 `ModelPricing` interface を導入する（D3）

`cacheWrite` フィールドを持たない `OpenAIPricing` 型を新設する案。

- **Pros**: 「cache write 課金が無い」ことを型レベルで表現できる
- **Cons**: 型分岐が cost 計算式へ波及し複雑化する。既存の 4 軸合算式に条件分岐が入る
- **Why not**: `cacheWrite: 0` で十分かつ最小。型を変えずに「課金なし」をデータとして表現する（D3）

### Alternative 5: config 不在時に解決不能として throw する（D4）

`queryOneShot` が `opts.model` も config も無い場合にエラーを投げる案。

- **Pros**: 「デフォルトモデル名を持たない」という provider 中立性を徹底できる
- **Cons**: zero-config 利用と既存テストを壊す。one-shot は現状 config なしで動作することが前提となっているユースケースがある
- **Why not**: 後方互換を維持しつつ provider 固有リテラルを排除するため、単一定数への集約を選択する（D4）

### Alternative 6: `init.ts` のデフォルト値と統合して単一値にする（D4）

`init.ts` が持つ `claude-sonnet-4-6` と `DEFAULT_ONE_SHOT_MODEL` を同一の値に統一する案。

- **Pros**: デフォルトモデルが一箇所になる
- **Cons**: `init.ts` は CLI 層であり本 request の編集領域外。one-shot のデフォルト値変更は scope 拡大になる
- **Why not**: デフォルト値の変更は本 request の目的でない。`init.ts` との統合は別 request で扱う（D4）

## Consequences

### Positive

- OpenAI / Codex 系モデルの step 別 cost が `specrunner usage` / `specrunner job show` で数値表示される
- `BUILTIN_MODEL_REGISTRY ⊆ pricing` invariant が CI で継続検証され、registry/pricing の drift が自動検知される
- `computeCostUsd` / `lookupPricing` のシグネチャ・呼び出し点が無変更で、既存 Claude コスト計算に影響なし
- one-shot のデフォルトモデルが単一定数に一元化され、adapter とポートの doc コメントが自動追従する

### Negative

- D2 の invariant が「registry へモデル追加 → pricing も追加」という保守カップリングを生む（意図した安全網として受容）
- OpenAI の公式単価が将来変動した場合、静的テーブルの陳腐化を手動で検知する必要がある（未知モデルが `$?` になる設計と同様、テーブルの "as of" コメントが唯一の劣化シグナル）

### Known Debt / Deferred

- OpenAI snapshot 付きモデル ID（`-YYYY-MM-DD` 形式）は現行 `normalizeModelKey`（8 桁数字除去）では正規化されない。codex adapter は config 解決済みの素のモデル名を usage key に使うため現状は問題ないが、正規化拡張は実需が出た時点で別 request とする
- `config.models[name].pricing` による単価上書きは scope 外。実需が出た時点で別 request
- `DEFAULT_ONE_SHOT_MODEL` の値は現行互換のため `"claude-sonnet-4-5"` を維持。provider 中立なデフォルト値への変更は別 request

## References

- Request: `specrunner/changes/usage-pricing-provider-neutral/request.md`
- Design: `specrunner/changes/usage-pricing-provider-neutral/design.md`
- Related: `specrunner/adr/2026-05-25-usage-json-cost-tracking.md`（token usage 永続化の先行 ADR）
- Related: `specrunner/adr/2026-05-22-one-shot-query-client-port.md`（OneShotQueryClient port 確立）
- Implementation: `src/core/usage/pricing.ts`・`src/config/model-registry.ts`・`src/adapter/claude-code/query-one-shot.ts`・`src/core/port/one-shot-query-client.ts`
