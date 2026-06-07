# Design: eslint covers tests/

## Context

`eslint.config.js` の `ignores` に `tests/**` / `**/*.test.ts` / `**/__tests__/**` が含まれており、テストコードは lint 対象外。`lint` スクリプトのターゲットも `./src` 単独。結果としてテスト側の整形崩れ・未使用シンボル・スタイル違反が品質ゲートを素通りする。

`src` は現状 `eslint ./src --max-warnings 0` が green（baseline 確認済み）。ignore を外すとテスト側に 74 件の違反が表面化する:

| ルール | 件数 | severity |
|--------|------|----------|
| `@typescript-eslint/no-unused-vars` | 63 | warn |
| `prefer-const` | 6 | warn |
| `@typescript-eslint/no-explicit-any` | 2 | warn |
| `@typescript-eslint/no-non-null-asserted-optional-chain` | 2 | error |
| unused eslint-disable directive | 1 | warn |

`lint` は `--max-warnings 0` 運用のため warning も含めゼロにする必要がある。eslint config は flat config（`typescript-eslint` recommended、非 type-checked）であり、tests も追加のパーサ設定なしで解析できる（表面化させた走査でパースエラーは発生しなかった）。

## Goals / Non-Goals

**Goals**:

- eslint の lint 対象に `tests/` 配下を含める（ignore 除去 + lint スクリプトのターゲット拡張）。
- 表面化した 74 件を解消し、`src` + `tests` 全体で `lint --max-warnings 0` を green にする。
- ルールを緩める場合は、対象を tests に絞った override に限定し、緩めた範囲と理由を config 上で追える形にする。
- `typecheck` / `test` を green に保つ（テストの挙動・件数の回帰なし）。

**Non-Goals**:

- プロダクションコード（`src/`）のロジック変更。
- `src` 側の lint ルール強度の変更。
- `GitHubClient` mock の共有 factory 化（別 request）。
- テスト用に別 eslint config ファイルを新設すること。

## Decisions

### D1: 単一 config で lint 対象を拡張する

`eslint.config.js` の `ignores` から `tests/**` / `**/*.test.ts` / `**/__tests__/**` の 3 globs を除去し（`dist/**` / `node_modules/**` は残す）、`package.json` の lint スクリプトを `eslint ./src` → `eslint ./src ./tests` に変更する。

- **Rationale**: テストコードを `src` と同一のルールセット・同一ゲート下に置くことで品質基準を一致させる。設定が 1 ファイルに集約され、ルールの drift を防げる。
- **Alternatives considered**:
  - tests 専用の別 eslint config / 別 lint invocation を新設 → 却下。config が 2 つに分かれ drift する。最小依存・最小構成という North Star に反する。

### D2: 違反は原則「コードを直す」。ルール緩和は tests 限定 override のみ

architect 評価済みの方針に従い、違反解消は原則テストコード側の修正で行う。ルールを緩めるのは、テストで正当な記法（例: 意図的な未使用 fixture 引数、エラーパス検証のための不正オブジェクト構築）を不当に弾く場合に限り、`files` を tests に絞った override block で行う。グローバルにルールを無効化しない。緩めた場合は config 上に範囲と理由（inline コメント）を残す。

- **Rationale**: `src` のルール強度を一切弱めずにテスト品質を底上げできる。override を tests スコープに閉じることで、緩和が `src` に波及しない。受け入れ基準「緩めた範囲と理由が config 上で明示」を満たす。
- **Alternatives considered**:
  - ノイズの多いルール（`no-explicit-any` など）をグローバルに off → 却下。`src` の検出力まで落ちる。
  - 各違反箇所に `eslint-disable` コメントを散布 → 却下。意図が分散し監査しづらく、`--max-warnings 0` 下では unused-disable のリスクも増える。

### D3: 違反をカテゴリ別に機械的 / 記法的へ分類して remediation

表面化した 74 件は全カテゴリがテストコード修正で解消可能（調査済み）。カテゴリごとに修正方針を固定する:

- **`no-unused-vars`（63）**: 真に未使用の import / ローカルは削除する。意図的に未使用な fixture 引数・変数は `_` prefix にリネームする（既存ルールが `argsIgnorePattern: "^_"` / `varsIgnorePattern: "^_"` を持つため override 不要で吸収できる）。
- **`prefer-const`（6）**: 再代入のない `let` を `const` に変更する。
- **`no-non-null-asserted-optional-chain`（2, error）**: `?.x!` 形を解体し、optional chain の結果を中間 const に取り出して assert する等で回避する。
- **`no-explicit-any`（2, warn）**: `as any` を `as unknown as <Type>` の型付きキャストへ置換し、ルールを有効に保ったまま解消する（既定）。これが記法として明確性を著しく損なう場合のみ D2 の override 対象とする。
- **unused eslint-disable directive（1）**: 対象の base ルール（`no-throw-literal`）は有効化されておらず disable は stale。コメントを削除する。

- **Rationale**: 全件がコード修正で解消可能なため、override は必須ではなく条件付き（受け入れ基準も「緩めた場合」と条件付き）。カテゴリ固定により implementer が箇所ごとに判断する余地を減らし、回帰リスクを抑える。
- **Alternatives considered**:
  - `eslint --fix` 一括適用に全面依存 → 却下。`no-unused-vars` の大半は自動修正不可（fixable は 7 件のみ）であり、削除 vs `_` prefix の意図判断は人手が要る。

## Risks / Trade-offs

- [Risk] 未使用変数を削除する際、副作用のある初期化や test 意図を巻き込み挙動が変わる → Mitigation: 削除より `_` prefix を優先し、修正後に全テストを実行して件数・結果の回帰がないことを確認する。
- [Risk] ルール緩和が広すぎてゲートが弱まる → Mitigation: override を tests の `files` に限定し、緩めたルールごとに inline で理由を記す。`src` lint が引き続き green であることを確認する。
- [Risk] stale な eslint-disable 削除が、将来ルール構成変更時に本来の違反を再露出させる → Mitigation: 参照先ルールが現構成で無効であることを確認したうえで削除する。lint green が裏付けとなる。
- [Trade-off] テストの記法が一部 `as unknown as <Type>` などやや冗長になる → 受容する。グローバルなルール緩和より局所的な型付きキャストの方がゲートの検出力を保てる。

## Open Questions

- なし（remediation 方針は D3 で確定。override は条件付きで implementer の裁量に委ね、緩和時は理由を config に明示する）。
