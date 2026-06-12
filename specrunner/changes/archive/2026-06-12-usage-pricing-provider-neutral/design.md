# Design: usage / pricing と one-shot デフォルトモデルの provider 中立化

## Context

cost 集計と表示が Claude 系モデル前提になっている。

- `src/core/usage/pricing.ts` の `MODEL_PRICING` は Claude 系のみを登録しており、OpenAI / Codex 系
  モデル名は `lookupPricing()` が `null` を返す。結果として `computeCostUsd()` が `null` となり、
  `specrunner usage`（`usage-summary.ts`）と `specrunner job show`（`cli/job-show.ts`）の cost 表示が
  `$?` になる。Codex 移行後は全 step がこの状態になり、step 別 cost の可視性が失われる。
- `src/config/model-registry.ts` の `BUILTIN_MODEL_REGISTRY` には既に OpenAI 系モデル
  （`o3` / `gpt-5.x` / `gpt-5.x-codex`）が provider 付きで登録されているが、pricing テーブルとは
  独立しており、両者の key 集合が drift している（registry にあるが pricing に無いモデルが存在する）。
- codex adapter（`src/adapter/codex/agent-runner.ts`）は `turn.usage` から `ModelUsage` を集計済みで、
  usage を `resolvedConfig.model`（config で解決した素のモデル名）を key に記録する。欠けているのは単価側のみ。
- `src/adapter/claude-code/query-one-shot.ts` の one-shot クエリは、config 解決チェーン
  （`getStepExecutionConfig`）を通すものの、最終フォールバックとして provider 固有のモデル名
  `"claude-sonnet-4-5"` をインラインのリテラルとして持つ（同名がポート doc コメントにも重複）。

`computeCostUsd` / `lookupPricing` は config を受け取らない純粋関数であり、`usage-summary.ts` /
`job-show.ts` の複数 surface から config なしで呼ばれている点が、設計上の重要な制約である。

## Goals / Non-Goals

**Goals**:

- OpenAI / Codex 系モデル名を与えたとき cost が数値で算出されるようにする（`$?` を解消する）。
- 単価の置き場を決定し、判断理由を記録する（要件1）。
- 未知モデルは従来どおり `null`（`$?` 表示）で壊れないことを維持する（要件2）。
- one-shot クエリのデフォルトモデルの provider 固有ハードコードを解消し、config 経由の解決に揃える（要件3）。
- registry に登録済みのモデルが単価未登録のまま `$?` になる回帰を、テストで継続的に防ぐ。

**Non-Goals**:

- codex adapter の機能 parity（別 request: codex-adapter-parity、編集領域 adapter/codex）。
- credential 管理（`anthropic.apiKey` 等）の命名・構造の中立化。
- 課金レポートの新機能（config での単価上書き・動的料金取得・新しい表示 surface 等）。
- `usage.json` のスキーマ / フォーマット変更。

## Decisions

### D1: OpenAI / Codex の単価は静的 `MODEL_PRICING` テーブルへ追加し、cost 関数は純粋なまま維持する

単価の置き場として 3 候補（テーブル追加 / model registry 統合 / config 上書き）を検討し、
**静的テーブルへの追加**を採用する。`computeCostUsd` / `lookupPricing` のシグネチャは変えず、config も
registry も注入しない。

**Rationale**:

- `computeCostUsd` / `lookupPricing` は `usage-summary.ts` と `job-show.ts` から **config なし**で呼ばれる
  純粋関数。registry（config 由来）へ統合すると、全 cost 計算呼び出し点へ config を引き回す大きな ripple が
  発生し、利得がない。
- 責務分離: model registry は「runtime dispatch のための provider 解決」、pricing は「表示時の単価換算」。
  別軸の関心事であり、統合すると単一責務が崩れる。
- 静的テーブルは既存の確立されたパターン（Claude 単価も出典・"as of" 付きの静的近似）。OpenAI エントリの
  追加はこのパターンの踏襲であり、応急処置（patchwork）ではない。
- minimal-deps 原則: 外部依存ゼロ・config 不要のまま要件を満たせる。

**Alternatives considered**:

- model registry へ `pricing` フィールドを統合 → 不採用。`ModelEntry` に単価を持たせると `computeCostUsd` が
  merged registry（config 依存）を要し、純粋関数性と複数 surface の呼び出し容易性を失う。
- `config.models[name].pricing` での上書き → 不採用。設定可変な単価は「課金レポートの新機能」であり scope 外。
  現時点で実需がなく YAGNI（minimal-deps 原則と整合）。

### D2: registry に登録済みの全モデルが単価を持つことを invariant とし、テストで固定する

`$?` の根本原因は「registry にあるモデルが pricing に無い」状態である。本変更後の invariant として
**`BUILTIN_MODEL_REGISTRY` の全モデルが `lookupPricing()` で非 `null`** を満たすこととし、これをテストで固定する。

**Rationale**:

- 要件1「OpenAI 系モデルの単価を解決できる」を、1 モデルだけでなく registry の全 OpenAI モデルについて
  網羅的に保証できる。Codex 移行で複数モデル（`gpt-5.x-codex` 等）が使われるため、網羅性が重要。
- 将来 registry にモデルを追加して単価を入れ忘れた場合に、テストが drift を検知する（回帰の予防）。
  これは本 request が修正する不具合クラスそのものに対するガードレールである。

**Alternatives considered**:

- 代表 1 モデルだけ非 `null` を検証 → 不採用。不具合クラス（registry/pricing の drift）を防げず、
  Codex 移行で使う他モデルが `$?` のまま残るリスクが残る。

### D3: pricing モジュールの出典記述を provider 中立化する

`pricing.ts` の header / コメントは現在「Source: Anthropic official pricing」のみ。OpenAI エントリ追加に伴い、
**provider 横断**の記述に改め、各エントリ群に provider 別の出典と "as of" 日付を残す。

**Rationale**: 単一 provider 前提の記述を残すと事実と齟齬が出る。出典・日付の明示は既存テーブルの規律を踏襲し、
将来の陳腐化を顕在化させる（未登録は `$?` で顕在化する設計と整合）。

### D4: OpenAI 系の単価は input / output / cached-input の 3 軸で表現し、cacheWrite 軸は 0 とする

`ModelPricing` は `{ input, output, cacheRead, cacheWrite }` の 4 軸。OpenAI 系には「cache write 課金」概念が
ないため、OpenAI エントリは `cacheRead` に cached-input 単価を割り当て、`cacheWrite` は `0` とする。

**Rationale**: codex adapter は `cached_input_tokens → cacheReadInputTokens` を写し、`cacheCreationInputTokens`
には Codex 等価がないため常に `0` を入れる（`agent-runner.ts`）。したがって `cacheWrite` 単価は常に 0 token に
乗算され cost に寄与しない。`cacheWrite: 0` は「この provider に cache write 課金が無い」ことをデータとして表し、
幻の単価を匂わせない。`ModelPricing` の型・cost 計算式は変更しない（4 軸のまま）。

**Alternatives considered**: OpenAI 用に別 interface を導入 → 不採用。型分岐が cost 計算式へ波及し複雑化する。
4 軸 + `cacheWrite: 0` で十分かつ最小。

### D5: one-shot デフォルトモデルを単一の共有定数に集約し、provider 固有リテラルを adapter から排除する

`query-one-shot.ts` のインラインリテラル `opts.model ?? "claude-sonnet-4-5"` を、config 層が所有する単一定数
`DEFAULT_ONE_SHOT_MODEL`（`src/config/model-registry.ts` に新設）へ置換する。実際の解決は従来どおり
`getStepExecutionConfig` のチェーンを通り、`config.steps.defaults.model`（chain level 4）が存在すればそれが
勝つ。リテラルは「config が何も与えない場合の最終フォールバック」としてのみ機能し、それを単一の文書化された
定数に一元化する。ポート（`one-shot-query-client.ts`）と adapter の doc コメントの `Default: "claude-sonnet-4-5"`
も定数参照へ更新する。

**Rationale**:

- 「config 経由の解決に揃える」= 解決機構を config チェーンに統一し、デフォルトを adapter ローカルの散在
  リテラルではなく config 所有の単一ソースにすること。デフォルトモデルは必ず何らかのモデル名を要するため、
  「名前を消す」のではなく「config が駆動する単一の出所に集約する」ことで中立化を達成する。
- 定数値は現行挙動を保つため `"claude-sonnet-4-5"` を維持する（デフォルト値の変更は本 request の目的ではない）。
- 置き場を `config/model-registry.ts` とするのは、モデルに関する権威を config 層へ集約するため（編集領域
  config と整合、`init.ts` の独自デフォルトとは独立に扱う）。

**Alternatives considered**:

- config 不在時に解決不能として throw する → 不採用。zero-config 利用と既存テストを壊す。
- `init.ts` のデフォルト（`claude-sonnet-4-6`）と統合して単一値にする → 不採用。`init.ts` は cli 層で
  本 request の編集領域外。one-shot のデフォルト値を変える行為は scope 拡大になるため見送る。

## Risks / Trade-offs

- [Risk] OpenAI 系（特に `gpt-5.x` 系）の公式単価は本リポジトリの想定モデル名に対して公開値が無い / 不確実な
  場合がある。
  - Mitigation: 公開単価がある分はそれを出典・"as of" 付きで登録し、無い分は最も近い公開 tier を近似として
    割り当て、近似である旨をコメントに明記する（既存 `[1m]` の "flat-rate approximation" 先例に倣う）。
    テストは exact な金額ではなく「非 `null`・4 軸合算式が成立・registry ⊆ pricing」を固定するため、
    単価値の見直しがテストを壊さない。
- [Risk] D2 の invariant は「registry へモデル追加 → pricing 追加」の保守カップリングを生む。
  - Mitigation: これは意図した安全網。`$?` 不具合クラスを CI で検知でき、追加コストはエントリ 1 件分で小さい。
- [Risk] OpenAI の snapshot 付きモデル ID（`-YYYY-MM-DD` 形式）は現行 `normalizeModelKey`（`-YYYYMMDD` の
  8 桁を除去）では正規化されない。
  - Mitigation: codex adapter は config 解決済みの素のモデル名を usage key に使うため、snapshot 付き ID は
    現状 usage データに現れない。正規化拡張は実需が出た時点で別 request とする（本変更では regex を変更しない）。
- [Risk] one-shot デフォルト定数の集約で、doc コメントとコードの整合が崩れると誤解を生む。
  - Mitigation: adapter とポート双方の doc コメントを同時に定数参照へ更新する（tasks に明記）。

## Open Questions

なし
