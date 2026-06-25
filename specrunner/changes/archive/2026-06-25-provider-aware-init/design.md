# Design: init で provider を選択し provider 別デフォルトモデルを scaffold に書く + model registry 更新

## Context

`specrunner init` が生成する config scaffold は、全ステップのデフォルトモデルを `claude-sonnet-4-6` 固定で書く。

- `src/cli/init.ts:59-65` — config 不在時に `steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } }` を固定で書く。provider を選ばせる対話フローは無い。
- `src/cli/init.ts:43-78` — global config が**既に存在する場合は scaffold 生成をスキップ**する（config-write-hygiene で導入済み）。project scaffold（drafts/ changes/ gitignore）の整備のみ行う。
- `src/core/step/design.ts:12` — design step は `DESIGN_AGENT_MODEL = "claude-opus-4-6[1m]"` を**ハードコードのデフォルト**として持つ（step-config resolution chain のレベル 5）。他ステップのハードコードは各 step 定義の `agent.model`。

run 時の provider dispatch はすでに動いている。`src/adapter/dispatching/agent-runner.ts` の `resolveProvider(modelName, mergedRegistry)`（実体は `src/config/model-registry.ts:49`）がモデル名から provider を引き、`"openai"` なら `CodexAgentRunner` に dispatch する。つまり **config の `steps.defaults.model` に OpenAI モデルを書けば、それだけで全ステップが Codex で走る**。Codex ユーザーに不足しているのは「init がその config を書いてくれる」ことだけで、resolution chain や dispatch には一切手を入れる必要がない。

加えて model registry（`src/config/model-registry.ts:13-29` の `BUILTIN_MODEL_REGISTRY`）に古い OpenAI モデルが残っている。`o3` / `gpt-5.1` / `gpt-5.2-codex` / `gpt-5.3-codex` は現行 Codex CLI で deprecated。現行モデル（`gpt-5.5` / `gpt-5.4` は既にある）に揃え、`gpt-5.4-mini` / `gpt-5.3-codex-spark` を追加する。

### registry 変更の波及（実測）

`BUILTIN_MODEL_REGISTRY` はモデル名 → provider の lookup 源であり、次の経路で参照される。registry からモデルを削除すると、そのモデル名を使う既存テスト fixture が red になる。

- `src/config/schema.ts:868-881`（`runSemanticChecks`）— `steps.*.model` が registry に無ければ `CONFIG_INVALID: ... is not in the model registry`。
- `src/adapter/dispatching/agent-runner.ts`（`resolveProvider`）— registry に無いモデルは `CONFIG_INVALID` で throw。
- `src/core/doctor/checks/runtime/codex-cli.ts:8-29`（`hasOpenAiSteps`）— merged registry を引いて `provider === "openai"` の step があるか判定。registry に無ければ openai と認識されず判定が変わる。

`o3` を fixture に使う既存テストは 4 ファイル（Risks 節と tasks T-04 に列挙）。registry 更新と同一 request 内でこれらを存命モデル（`gpt-5.4`）へ差し替えないと `typecheck && test` が green にならない。

> Note: コスト表示 `src/core/usage/pricing.ts` の `MODEL_PRICING` は registry とは独立した別マップで、registry 削除の影響を受けない（`tests/core/usage/pricing.test.ts` は `MODEL_PRICING` を直接参照するため green のまま）。pricing は本 request のスコープ外（Non-Goals 参照）。

## Goals / Non-Goals

**Goals**:

- `specrunner init` に provider 選択を足す。`--provider anthropic|openai` フラグで受け取り、フラグ省略 + TTY なら対話プロンプト、フラグ省略 + 非 TTY（CI 等）なら `anthropic` をデフォルトにする（現行互換）。
- provider 別のデフォルトモデルテーブルを 1 つ用意し、init が scaffold の `steps.defaults.model`（および openai のときのみ `steps.design.model`）に対応モデルを書く。
- `BUILTIN_MODEL_REGISTRY` を現行 OpenAI モデルへ更新する（deprecated 削除・現行追加）。registry 変更で red になる既存テスト fixture を存命モデルへ差し替え `typecheck && test` を green に保つ。
- 既存 config がある場合は provider を聞かず、config を一切書き換えない（config-write-hygiene の挙動維持）。

**Non-Goals**:

- `SpecRunnerConfig` への `provider` フィールド追加 — init が scaffold の `steps` に展開すれば十分。config への永続化・resolution chain への provider 解決層追加は行わない（D2）。
- preflight / doctor での provider チェック追加 — SDK 有無チェックは run 時に `loadOptionalProviderSdk()` が既に担う。
- 各ステップのハードコードモデル定数（`design.ts:12` 等）の変更 — resolution chain レベル 5 として残す。config の `steps.defaults.model` / `steps.design.model` が先に解決される。
- `DEFAULT_ONE_SHOT_MODEL`（`model-registry.ts:35`）の provider 対応 — one-shot query は別経路。今回対象外。
- pricing（`MODEL_PRICING`）への新モデル追加 — registry とは独立。未登録モデルのコストは `formatUsd` が `"$?"` と表示する非致命挙動（`computeCostUsd` は null を返す）。本 request では触らない（Open Questions 参照）。

## Decisions

### D1: provider 別デフォルトを `PROVIDER_DEFAULTS` テーブルとして `model-registry.ts` に置く

`src/config/model-registry.ts` に provider 別デフォルトモデルのテーブルを追加する。`Provider` 型・`BUILTIN_MODEL_REGISTRY` と同一ファイルに凝集させる（新ファイル不要）。

```
interface ProviderDefaults {
  /** steps.defaults.model に書く値（design 以外の全ステップ）。 */
  defaultModel: string;
  /**
   * steps.design.model に書く値（高品質 design step）。
   * design step のハードコードデフォルトが既にこの provider の design model と一致する場合は省略し、
   * scaffold を legacy（anthropic）出力とバイト一致に保つ。
   */
  designModel?: string;
}

const PROVIDER_DEFAULTS: Record<Provider, ProviderDefaults> = {
  anthropic: { defaultModel: "claude-sonnet-4-6" },                      // design は design.ts の built-in claude-opus-4-6[1m] を使う
  openai:    { defaultModel: "gpt-5.4-mini", designModel: "gpt-5.5" },
};
```

init は `steps.defaults.model = PROVIDER_DEFAULTS[p].defaultModel` を常に書き、`PROVIDER_DEFAULTS[p].designModel` が定義されているときのみ `steps.design = { model: ... }` を書く。これにより provider 条件式（`if (provider === "openai")` の類）が**コードに現れず**、テーブル lookup 1 箇所に provider 分岐が閉じる（module-architect レビューの「provider 条件式の散在防止」を満たす）。

- **Rationale（why designModel を anthropic で省略するか）**: 受け入れ基準は「`--provider anthropic` で生成された config が**従来と同一**」。従来の scaffold は `steps.defaults` のみで `steps.design` を書かない。anthropic の design model（`claude-opus-4-6[1m]`）は design step のハードコードデフォルト（`design.ts:12`）と既に一致するため、`steps.design` を書かなくても効果は同じ。よって anthropic では省略してバイト一致を維持し、openai では design step の built-in（anthropic の opus）が dispatch を Claude に逸らしてしまうため `steps.design.model` の明示が必須。テーブルの `designModel?` 省略可性がこの非対称を data として表現する。
- **Rationale（why model-registry.ts に置くか）**: `Provider` 型と `BUILTIN_MODEL_REGISTRY` が同居するファイルで、provider という概念の単一の住所。`src/cli/init.ts`（composition-root）が `PROVIDER_DEFAULTS` を参照する向き（composition-root → shared-kernel）は DSM で許可済み。`src/config/step-config.ts`（shared-kernel）は provider の概念を持たず変更不要。
- **Alternatives considered**:
  - 却下（init.ts 内に provider→model のリテラル分岐を直接書く）: provider 知識が composition-root に散る。テーブル化で 1 箇所に凝集する方が再利用・テストしやすい。
  - 却下（anthropic でも `steps.design.model` を冗長に書く）: 受け入れ基準「従来と同一」に反する。design step の built-in と二重定義になり、将来 built-in を変えたとき scaffold だけ取り残される。

### D2: config に `provider` フィールドを持たせず、init が `steps` に展開する

`SpecRunnerConfig` に `provider` フィールドは追加しない。init が `PROVIDER_DEFAULTS` を引いて scaffold の `steps.defaults.model` / `steps.design.model` に直接書くだけにする。既存の 6-level resolution chain は一切変えない。

- **Rationale**: config に `provider` を持たせると resolution chain に「provider → model」の解決層を足す必要があり侵襲が大きい。init が scaffold に書くだけで同じ効果（init → login → run が両 provider で動く）が得られる。run 時の provider は `steps.defaults.model` のモデル名から `resolveProvider` が引くので、provider の永続化は不要。
- **Alternatives considered**:
  - 却下（`config.provider` を追加し dispatch 時に参照）: resolution chain と dispatch 双方に provider 層が必要。最小侵襲という設計目標に反する。

### D3: provider 解決は flag → TTY 対話 → 非 TTY デフォルト anthropic の順。**config 不在ブロック内**でのみ解決する

provider の決定ロジックを純粋寄りの helper に切り出し、テスト可能な seam にする。

```
resolveInitProvider(
  flagProvider: Provider | undefined,
  io: { isTTY: boolean; ask: (q: string) => Promise<string> },
): Promise<Provider>
```

- `flagProvider` があればそれを返す。
- 無く `io.isTTY === false` なら `"anthropic"`（現行互換）。
- 無く `io.isTTY === true` なら `io.ask("Which provider? [1] Anthropic [2] OpenAI (default: Anthropic): ")` の結果を解釈（`"2"` / `"openai"` / `"o"` → openai、それ以外・空 → anthropic）。

既定の配線（init.ts 側）は `process.stdin.isTTY` と `node:readline`（`src/cli/login.ts:137` / `src/cli/managed.ts:321` と同じ `readline.createInterface({ input: process.stdin, output: process.stdout })` パターン）を使う。`src/core/cancel/runner.ts:373-386` の `promptConfirm(stdin, ...)` + `isTTY` injectable の流儀を踏襲し、テストでは fake `ask` を渡して readline を実起動しない。

provider 解決は `runInit` の **config 不在ブロック（`if (!configExists)`）の内側**で行う。config が既に存在する場合は provider を聞かず（プロンプトも出さず）scaffold を書かない。これにより「config 存在時は `--provider` の有無に関わらず書き換えない」を満たす。

- **Rationale**: TTY ではユーザーに選ばせ、フラグを知らなくても provider を設定できる。非 TTY（CI）では anthropic デフォルトで現行互換。`--provider` は非対話・スクリプト用に残す。解決を config 不在ブロック内に置くことで「config があるのにプロンプトを出して何もしない」UX 事故を防ぎ、書き換え禁止の受け入れ基準も構造的に満たす。
- **Alternatives considered**:
  - 却下（config 存在チェックより前に provider を解決）: config があってもプロンプトが出る。解決値が捨てられ、対話が無意味になる。
  - 却下（runInit に readline 依存を直書きしテスト時に実 stdin を使う）: 非 TTY 検出に依存した脆いテストになる。injectable seam の方が決定的。

### D4: `command-registry.ts` の init エントリに `--provider` フラグを足す

`COMMANDS.init.flags` に `provider: { type: "string", values: ["anthropic", "openai"] as const }` を追加し、handler で `parsed.flags["provider"]` を `runInit({ runtime, provider })` に渡す。

- **Note**: `COMMANDS.login` も `provider` フラグを持つ（`command-registry.ts:260`、値域 `["github", "claude"]`）。これは別コマンドエントリで値域も意味も異なるため衝突しない。同名だが別物である点をレビュー時に留意。
- **Rationale**: 既存のフラグ定義テーブル方式（`{ type, values }`）に素直に乗せる。values 制約で不正値は CLI 層で弾かれる。

### D5: `BUILTIN_MODEL_REGISTRY` を現行 OpenAI モデルへ更新する

`src/config/model-registry.ts` の openai エントリを次のとおりにする。

- 削除: `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex`
- 追加: `gpt-5.4-mini`, `gpt-5.3-codex-spark`
- 維持: `gpt-5.4`, `gpt-5.5`（既存）

結果の openai 群: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`。anthropic 群は不変。

registry 変更で red になる既存テスト（`o3` を fixture に使用）を、存命の openai モデル `gpt-5.4` へ差し替える。対象は Risks / tasks T-04 に列挙。`tests/config/model-registry.test.ts` の `o3` / `gpt-5.3-codex` の存在アサーションも存命モデルへ更新し、追加モデルのアサーションを足す。

- **Rationale**: registry はモデル名→provider の単一の真実。deprecated を残すと `init --provider openai` 後に古いモデルを使う config を書く余地が残る。同一 request 内でテスト fixture を揃えないと CI が割れる（registry とテストは同じ変更単位）。
- **Alternatives considered**:
  - 却下（registry とテスト更新を別 request に分ける）: registry を変えた瞬間にテストが red になり、その request 単体で `typecheck && test` が green にならない。分割不可。

## Risks / Trade-offs

- [Risk] registry から `o3` を消すと、`o3` を fixture に使う既存テストが red になる（`schema.ts` の registry 検証 / `resolveProvider` / doctor `hasOpenAiSteps` を経由するため）→ Mitigation: 同一 request 内で次の 4 ファイルを存命モデル `gpt-5.4` へ差し替える。`tests/config/model-registry.test.ts`（`o3` / `gpt-5.3-codex` の provider アサーション）、`tests/config/schema.test.ts`（L128 / L137 / L463 の `steps.*.model: "o3"`）、`tests/core/doctor/checks/runtime/codex-cli.test.ts`（L45 / L63 / L78）、`tests/adapter/dispatching/agent-runner.test.ts`（L105 `makeCtx("o3")`）。
- [Risk] anthropic scaffold に `steps.design` を書いてしまい「従来と同一」を破る → Mitigation: D1 のとおり `PROVIDER_DEFAULTS.anthropic.designModel` を省略し、init は `designModel` 定義時のみ `steps.design` を書く。anthropic 用テストで `steps.design === undefined`（または従来 snapshot 一致）を確認する。
- [Risk] 対話プロンプトのテストが実 stdin/TTY に依存して flaky になる → Mitigation: D3 の `resolveInitProvider(flag, { isTTY, ask })` seam を使い、テストは fake `ask` と `isTTY` を渡す。既定配線の readline は薄く保つ。
- [Risk] 既存 init テスト（`runInit({})` 呼び出し）が provider 追加で壊れる → Mitigation: `runInit({})` は flag 無し・非 TTY（vitest 環境）で anthropic に解決し、従来と同一の scaffold を書く。後方互換。
- [Trade-off] anthropic の design model を scaffold に明示せず design step の built-in に委ねる。scaffold だけ見ても anthropic の design model は分からないが、「従来と同一」の受け入れ基準を優先する。design.md（本書）と registry コメントで built-in 由来を明記して補う。

## Open Questions

- 新 openai モデル（`gpt-5.4-mini` / `gpt-5.3-codex-spark`）と `gpt-5.5` の pricing 未登録によりコスト表示が `"$?"` になる。本 request のスコープ外（Non-Goals）。コスト表示が必要なら別 request で `MODEL_PRICING` を更新する。非致命（`computeCostUsd` は null を返すのみ）。
- 対話プロンプトの文言・入力受理パターン（`"1"/"2"` だけか、`"anthropic"/"openai"` 文字列も受けるか）は実装者裁量。本設計は数字 + 先頭文字 + 完全名を受ける案を推奨するが、最低限 `"2"`/`"openai"` を openai、空/その他を anthropic に解釈できれば足りる。
