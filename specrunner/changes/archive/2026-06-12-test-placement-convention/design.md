# Design: test-placement-convention

## Context

specrunner を collocated test 規約のホストプロジェクト（例: pnpm monorepo の gamesmith）で使うと、
implementer が生成する test ファイルがホストの vitest `include` パターンに一致しない場所に置かれ、
どの test runner からも実行されない「死んだ test ファイル」になる（#565）。失敗が無音で、毎回の run で再発する。

現状コードの前提（grep 済み）:

- test 配置のハードコードは**コード側に存在しない**。`src/core/verification/test-coverage.ts` は TC ID を
  プロジェクト全域の `*.test.*` / `*.spec.*` から探す**配置非依存**の設計（先行 change `test-dir-detection` で確立）。
- 配置を指示する prompt も存在しない。`src/prompts/implementer-system.ts:49` は
  「**テストの配置先はプロジェクトの既存テストの配置パターンに従う**（特定ディレクトリを指定しない）」と述べるのみで、
  配置は implementer LLM の自由判断に委ねられている。`src/prompts/test-case-gen-system.ts` にも配置規約の注入点はない。
- したがって根本原因は「配置が LLM の自由判断であり、LLM の既定の癖（`tests/<slug>/`）がホスト規約と食い違うこと」。

注入機構の現状:

- 各 step の user message は `buildMessage(state, deps)` が生成し、`deps.config: SpecRunnerConfig` にアクセスできる
  （`src/core/port/step-context.ts`）。implementer は `buildImplementerInitialMessage()`（`src/core/step/implementer.ts`）で
  user message を組み立て、既に `dynamicContext`（branch context）を**条件付きで append** する前例を持つ。
- agent の `system` プロンプトは `AgentDefinition` の**静的フィールド**で、job ごとに差し替える経路を持たない。
  job 固有の可変要素は従来すべて **user message** 経由で注入されている（dynamicContext / projectContext）。
- config 検証は `src/config/schema.ts` の 2 層（zod 構造検証 → semantic check）。新規 optional key は RawConfig に
  passthrough を足し、`configSchema` に検証を追加するだけで load 時に弾ける。

制約:

- minimal-deps North Star — 新規依存を追加しない。
- 「format / path は tool / CLI が決める、agent は semantic content のみ」（rules.md 思想原則）に従い、agent の判断点を消す。
- 後方互換: 未設定プロジェクトの run 結果（prompt 内容）を一切変えない。

## Goals / Non-Goals

**Goals**:

- プロジェクト config に test 配置規約を宣言する第一級項目 `tests.placement` を追加する。
  自由 prose ではなく、CLI がテンプレート展開できる**構造化された discriminated union**。
- 宣言された配置規約を implementer の **user message に決定的に注入**し、agent の自由判断を config 由来の指示に置き換える。
- config schema 検証に新項目を組み込み、不正値を load 時に弾く（既存 `src/config/schema.ts` の 2 層検証に従う）。
- 未設定時は現挙動（agent 判断）を維持し、prompt 内容を不変に保つ。

**Non-Goals**:

- vitest / jest 等の設定ファイルを読んで include パターンを自動推定すること（実行系依存で fragile、minimal-deps に反する）。
- test 生成を「scenario のみ生成しコード化をプロジェクトに委ねる」方向へ切り替えること（#565 第 3 案、別 issue）。
- `test-coverage` 検証ロジックの変更（既に配置非依存のため不要）。
- test-case-gen に配置を言及させること（配置はコード化時の関心事。test-case-gen は無改変）。
- implementer の `system` プロンプトを job 可変化すること（静的フィールドのまま。注入は user message に閉じる）。

## Decisions

### D1: `tests.placement` を `style` による discriminated union で宣言する

top-level に `tests?: { placement?: TestPlacement }` を追加する。`TestPlacement` は `style` で分岐する union:

- `sibling`: フィールド `style: "sibling"`, `suffix?`（既定 `.test.ts`）。
  test を対象ソースと**同一ディレクトリ**に置く。例: `src/foo/bar.ts` → `src/foo/bar.test.ts`。
- `mirror`: フィールド `style: "mirror"`, `testsRoot`（必須）, `sourceRoot?`, `suffix?`（既定 `.test.ts`）。
  `testsRoot/` 配下にソースツリーを**ミラー**する。`sourceRoot` 省略時はソースの完全パスを `testsRoot` 配下に保持、
  指定時はその prefix を剥がす。
  例（`testsRoot: "tests"`, `sourceRoot: "src"`）: `src/foo/bar.ts` → `tests/foo/bar.test.ts`。
  例（`testsRoot: "tests"`, `sourceRoot` 省略）: `src/foo/bar.ts` → `tests/src/foo/bar.test.ts`。

既定 suffix は定数 `DEFAULT_TEST_SUFFIX = ".test.ts"` として `src/config/schema.ts` に置く（renderer が参照）。

- **Rationale**: 要件の 2 例（同階層 / ミラー）を構造で表現でき、CLI が決定的にテンプレート展開できる。
  自由 prose を排し、agent の判断点を消す。`style` を判別子にすることで schema が必須フィールド
  （mirror の `testsRoot`）を構造的に強制でき、D3 の不正値拒否が semantic check 不要で成立する。
- **Alternatives considered**:
  - 単一テンプレート文字列（例 `"{dir}/{name}.test.ts"`）を config に書かせる → 棄却。記法の学習コストと
    エスケープ/誤記の温床。検証が緩く、誤記が無音で再発する #565 の轍を踏む。
  - flat object（`style` + 任意フィールド）+ semantic check で必須性を後追い検証 → 棄却。union の方が
    schema 単独で必須フィールドを強制でき、検証ロジックが薄い。
- **命名根拠**: `sibling` = 同階層、`mirror` = ミラー。`sourceRoot` / `testsRoot` は対で読める。

### D2: 配置規約は implementer の **user message** に決定的注入する（system プロンプトは無改変）

純関数 renderer を新設し、`buildImplementerInitialMessage()` が `placement` 指定時に末尾セクションとして append する。

- 新ファイル `src/prompts/test-placement.ts` に
  `renderTestPlacementInstruction(placement: TestPlacement): string` を置く（純関数、I/O なし）。
  `## Test File Placement` セクション（markdown）を返し、`style` ごとに決定的な配置指示と変換例（before → after）を展開する。
  指示文は「既定方針（既存テスト配置に従う）より優先する」旨を明記し、system プロンプト line 49 との競合を解消する。
- `buildImplementerInitialMessage(opts)` に `placement?: TestPlacement` を追加。`placement` ありのとき
  `dynamicContext` セクションと同様に**条件付き**で append。なしのとき message は現状とバイト一致。
- `ImplementerStep.buildMessage(state, deps)` が `placement: deps.config.tests?.placement` を渡す。

- **Rationale**: job 固有の可変注入は従来すべて user message 経由（dynamicContext / projectContext）。
  同じ経路に乗せることで、(a) 未設定時に system / user の両方が不変に保て（後方互換）、
  (b) `AgentDefinition.system` の静的構造を壊さない（job ごとの system 差し替え経路を新設しない）。
- **Alternatives considered**:
  - system プロンプト line 49 を config 由来に書き換える → 棄却。`system` は静的フィールドで job 可変化に
    executor の改修が要る。さらに line 49 は先行 change の test（TC-011: 「既存テストの配置パターンに従う」「特定
    ディレクトリを指定しない」の存在）で固定されており、未設定時の不変性も崩す。
  - system プロンプトに「config があれば従え」という条件文を静的に追記 → 棄却。config 値が system に入らないため
    結局 user message 注入が要る。二重注入は冗長。
- **競合解消**: system は「既存パターンに従う」を述べ続けるが、user message の配置指示が「これは既定方針より優先」と
  明示するため、agent はより proximate で具体的な user message 指示に従う。

### D3: schema 2 層検証に `tests.placement` を組み込み、不正値を load 時に弾く

`src/config/schema.ts`:

- `RawConfig` に `tests?: unknown;` を passthrough として追加（`verification?: unknown` と同パターン）。
- `SpecRunnerConfig` に `tests?: TestsConfig;` を追加。
- `configSchema` に `tests: optional(object({ placement: optional(testPlacementSchema) }))` を追加。
  `testPlacementSchema` は `union([siblingSchema, mirrorSchema], <message>)`:
  - `siblingSchema`: `object({ style: literal("sibling"), suffix: optional(non-empty string) })`
  - `mirrorSchema`: `object({ style: literal("mirror"), testsRoot: non-empty string, sourceRoot: optional(non-empty string), suffix: optional(non-empty string) })`
- 検証失敗は既存 `throwFromFirstIssue` 経路で `CONFIG_INVALID: tests.placement ...` として throw される。
  semantic check（`runSemanticChecks`）の追加は不要（union が構造的に必須フィールドを強制する）。

- **Rationale**: 既存の zod 構造検証パターンに完全準拠。union により `style` 不正・mirror の `testsRoot` 欠落・
  型不一致がすべて構造検証だけで CONFIG_INVALID になる。
- **Alternatives considered**:
  - semantic check 層で「mirror なら testsRoot 必須」を後追い検証 → 棄却。union で構造的に強制する方が薄い。

### D4: test-case-gen / test-coverage は無改変

- test-case-gen-system.ts は配置に言及しない現状を維持する（配置はコード化時の関心事）。
- test-coverage.ts は既に配置非依存（`*.test.*` / `*.spec.*` をプロジェクト全域から収集）なので変更不要。
  `tests.placement` が決める配置先は test-coverage の収集範囲（プロジェクト全域）の部分集合であり、検証は配置に追従する。

- **Rationale**: 関心の分離。配置の宣言は config、注入はコード化 step（implementer）、検証は配置非依存ゲートに閉じる。

### D5: `tests.placement` を README の Configuration / Supported Scope に文書化する

第一級 config として docs で可視にする方針（per-step rules での運用回避を棄却した理由）に従い、
README の config ドキュメント（`verification.commands` の隣）に `tests.placement` の例（sibling / mirror）を追記する。

- **Rationale**: out-of-the-box で誰も書かなければ無音の死亡が既定挙動のまま残る。docs に出して発見可能にする。

## Risks / Trade-offs

- [Risk: user message 注入と system プロンプト line 49 の指示競合] → Mitigation: 注入文に「既定方針より優先」を
  明記。user message は system より proximate な具体指示で、agent はこちらに従う。未設定時は注入なしで競合も発生しない。
- [Risk: prompt content test が脆くなる] → Mitigation: 注入時は「`## Test File Placement` セクションの存在 +
  style 由来アンカー（`sibling` の同階層表現 / mirror の `testsRoot` 値）」を最小限検証。未設定時は
  「`Test File Placement` セクション不在 + message が現状と一致」を検証。`tests` という語全般は禁止しない。
- [Trade-off: suffix の既定が `.test.ts` 固定] → 多言語プロジェクトでは `suffix` 明示で上書き可能。
  既定値は #565 の主対象（TS monorepo）に最適化。
- [Risk: mirror のパスマッピングは agent が計算する（CLI は指示文のみ生成）] → Mitigation: 指示文に
  具体的な変換例（before → after）を埋め込み、曖昧さを排す。CLI 側でパス計算ロジックを実装しない（minimal）。

## Open Questions

- `suffix` 以外の命名軸（`.spec.ts` を既定にするプロジェクト）— 現状は `suffix` 明示で対応。必要が生じれば
  プロジェクト既定の検出を別途検討する（本変更では Non-Goal）。
- 第 3 の style（例: 専用 `__tests__/` サブディレクトリ）の将来追加 — union への variant 追加で拡張可能。本変更では 2 style に限定。
