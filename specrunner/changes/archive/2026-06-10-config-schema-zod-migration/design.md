# Design: config schema の手書きバリデータを zod ベースに移行する

## Context

`src/config/schema.ts` の `validateConfig(raw: unknown): SpecRunnerConfig` は 500 行超の
手書き検証で、各 config セクション（runtime / agents / environment / specReview / pipeline /
steps / models / progress / verification / github / logs / archive）を `typeof` ガードと
`if-then` 連鎖で逐次検証している。フィールド追加のたびに TS interface（`SpecRunnerConfig` 系）と
検証ロジックを手動で同期する必要があり、検証漏れのリスクがある。

検証の出力契約は以下で固定されている:

- 失敗時は `Error` を throw する。多くのサイトは `Object.assign(new Error(...), { code: "CONFIG_INVALID" })`
  で `.code = "CONFIG_INVALID"` を付与し、メッセージは `CONFIG_INVALID: <path> <reason>.` 形式。
- `src/config/store.ts` の `validateAndWrap` が `.code === "CONFIG_INVALID"` を見て
  `SpecRunnerError(CONFIG_INVALID, hint, message)` に変換する。`.code` が無い場合は
  `configIncompleteError`（`CONFIG_INCOMPLETE`）にフォールバックする。
- `CONFIG_INVALID` / `CONFIG_INCOMPLETE` はいずれも exit code 2（`ARG_ERROR`）に写像される。
- 例外的に `.code` を付けない既存サイトが 3 箇所存在する:
  1. root 非オブジェクトガード `"Config must be a JSON object."`
  2. version ガード `"Config version must be 1."`
  3. `pipeline.maxRetries` 範囲外 `"CONFIG_INVALID: pipeline.maxRetries must be between 1 and 10."`
     （メッセージに prefix はあるが `.code` は無い → store 経由では `CONFIG_INCOMPLETE` の hint になる）

`validateConfig` は migration（`applyMigration`）後に呼ばれ、検証後は受け取った `raw` を
そのままキャストして返す（未知フィールド `jobs.location` 等を保持する）。

zod は既存依存（`zod@4.4.3`）。`zod/v4-mini` は `report-tool.ts` の tool schema 生成で使用実績がある。
本変更の検証先行調査により、`zod/v4-mini` は `number` / `int` / `gte` / `lte` / `minLength` /
`record` / `union` / `literal` / `enum` / `nullable` / `optional` / `object` / `array` /
`safeParse` を提供し、custom error message を `invalid_type` を含む全 issue に適用でき、
union が inner path（`commands.0.run`）を報告し、object が未知キーを strip（error にしない）ことを確認済み。

## Goals / Non-Goals

**Goals**:

- `validateConfig` の手書き型チェック連鎖を zod スキーマ検証へ置換し、検証ルールと型の情報源を一本化する。
- 既存のエラー契約（`CONFIG_INVALID` code / exit code / hint / メッセージ形式）を維持する。
- スキーマで表現しにくい複雑条件を、スキーマ検証後の独立した後段チェックとして分離する。
- 変更の影響範囲を `src/config/` 内（主に `schema.ts`）に閉じる。

**Non-Goals**:

- config スキーマへのフィールド追加・仕様変更。
- config ファイルのフォーマット変更・migration 追加。
- `report_result` parseInput（`src/core/port/report-result.ts`）の zod 化。手書き方針を維持する。
- `validateConfig` のシグネチャ・呼び出し側（`store.ts` / `migrate.ts`）の変更。

## Decisions

### D1: 2 層バリデータ（zod 構造スキーマ + 後段セマンティックチェック）

`validateConfig` 本体を次の 2 層に再構成する:

1. **zod 構造スキーマ**（`configSchema`）— 各セクションの型・範囲・enum・必須/任意を宣言的に表現する。
   `safeParse` で評価し、issue を翻訳層へ渡す。
2. **後段セマンティックチェック** — スキーマ検証が成功した後にのみ実行する独立関数群。

`validateConfig` は「スキーマ評価 → 翻訳して throw（失敗時）→ 後段チェック → `raw` を返す」という
線形フローになり、`if-then` 連鎖を持たない。

- **Rationale**: 型・範囲・enum の単純規則は zod の宣言で表現でき、フィールド追加時の手動同期が消える。
  複雑条件を後段へ分離することで、スキーマは「形」だけを担い読みやすさを保つ。
- **Alternatives considered**:
  - 全規則を 1 つの巨大 zod スキーマに `refine` で詰め込む → 複雑条件の error path/message 制御が難しく、
    R3（後段分離）に反する。却下。
  - 手書きのまま型ガードを関数分割するだけ → 情報源一本化（Goal）を達成しない。却下。

### D2: validation-only（検証副作用のみ。返り値は元の `raw`）

zod スキーマは検証のためだけに使い、`validateConfig` の返り値は **zod parse 出力ではなく元の
migrated オブジェクト**（`raw as SpecRunnerConfig`）とする。

- **Rationale**: zod の `object` は未知キーを strip するため、parse 出力を返すと `jobs.location` 等の
  未知/レガシーフィールドが消え、現行の passthrough 挙動（TC-JOBS-02）と round-trip 保存が変わる。
  検証専用にすれば coercion / strip / default 注入の副作用を一切持ち込まない。
- **Alternatives considered**:
  - parse 出力を返し loose/passthrough モードで未知キーを保持 → v4-mini の passthrough 挙動への依存と
    coercion リスクが増える。検証専用の方が現行挙動との同値性が高い。却下。

### D3: エラー翻訳層（最初の issue → レガシー形式の `Error`）

`safeParse` 失敗時、`error.issues[0]` を 1 件取り出して `Error` に翻訳する:

- path を `steps.code-review.byRequestType.spec-change.model` / `verification.commands[0].run` の形に
  描画する（数値セグメントは `[n]`、文字列セグメントは先頭はそのまま・以降は `.seg`）。
- 各スキーマノードに legacy reason（例 `"must be a non-empty string."`）と一致する custom message を付与し、
  翻訳層は `CONFIG_INVALID: <path> <message>` を組み立て、`.code = "CONFIG_INVALID"` を付与する。
- multi-constraint フィールド（型 + int + 範囲）は全 check に同一 message を付与し、どの違反でも同一 reason を返す。
- **3 つの no-code 例外サイトを忠実に再現する**（Context 参照）。version は専用 message + no-code、
  root 非オブジェクトは専用 message + no-code、`pipeline.maxRetries` 範囲外は prefix 付き message + no-code。

- **Rationale**: store / exit-code / hint の写像はメッセージ prefix と `.code` の有無に依存している。
  既存テストはメッセージ正規表現で検証しており、忠実再現が受け入れ基準（テスト無改変 green）を満たす唯一の方法。
  no-code 例外を再現することで、未テストの store 経由 hint（`maxRetries` → `CONFIG_INCOMPLETE`）も drift しない。
- **Alternatives considered**:
  - zod 既定メッセージをそのまま露出 → R2（機械可読 code + 人向け hint への変換）に反し、テストが落ちる。却下。
  - no-code 例外も一律 `.code = CONFIG_INVALID` に統一 → store 経由 hint が変わり「hint 体系維持」に反する。却下
    （将来クリーンアップ候補として Open Questions に記録）。

### D4: 情報源の一本化（schema を検証の唯一の真実とし、型 drift を compiler で防止）

zod スキーマを検証ルールの唯一の真実とする。広く import されている公開 interface（`SpecRunnerConfig`
および関連型）は維持しつつ、スキーマの推論型と interface の構造的整合を **コンパイル時アサーション** で
束縛し、片方だけ変更すると型エラーになるようにする。

- **Rationale**: 背景の痛点は「interface と検証ロジックの手動同期」。検証ロジックがスキーマ自身になり、
  interface ↔ スキーマの整合が compiler 強制になれば、手動同期は消える。interface を z.infer で全面置換すると
  `version: 1` リテラルや `agents` の `AgentStepName` キー、JSDoc が失われ、リポジトリ全域の import 先 type が
  変わって typecheck の影響範囲が爆発する。本決定は痛点を解消しつつ blast radius を `src/config/` に閉じる。
- **Alternatives considered**:
  - interface を z.infer で全面置換 → blast radius 過大（Non-Goal / scope 厳守に反する）。却下。
  - 整合チェック無しでスキーマと interface を併存 → 再び手動同期に戻る。却下。

### D5: 後段セマンティックチェックを独立関数として分離

スキーマで表現しにくい/しない条件を、スキーマ成功後に走る独立関数として実装する:

- **model registry チェック** — step / byRequestType の `model` が `BUILTIN_MODEL_REGISTRY` と
  user `models` のマージ結果に存在するか、および managed runtime での OpenAI model 排他。
- **byRequestType セマンティクス** — 空文字キー検出、nested `byRequestType` 禁止（1-level limit）、
  未知 request type の warning（`stderrWrite`、非 throw）。これらは raw オブジェクトを走査して判定する
  （zod が未知キー `byRequestType` を strip するため）。

- **Rationale**: R3（複雑条件を後段の独立チェックに分離し、`if-then` 連鎖に戻さない）を直接満たす。
  registry チェックは外部データ（registry マージ）依存、warning は非 throw の副作用であり、いずれも
  純粋な構造スキーマでは表現に適さない。
- **Alternatives considered**:
  - registry チェックを zod `refine` 内に埋め込む → external state 依存と message 制御の複雑化。却下。

### D6: load / migration 経路は不変

`validateConfig` のシグネチャ `(raw: unknown) => SpecRunnerConfig` を維持し、`store.ts`
（`parseAndMigrate` / `validateAndWrap` / `loadConfig` / `deepMergeConfig`）と `migrate.ts`
（`applyMigration`）は変更しない。

- **Rationale**: R4（読み込み・migration の既存挙動を変えない）。検証は migration 後の単一関数に閉じており、
  そこだけ差し替えれば契約を保てる。
- **Alternatives considered**: migration も zod 化 → Non-Goal かつ blast radius 拡大。却下。

## Risks / Trade-offs

- [Risk] zod の issue 順序が legacy のセクション検証順と異なり、複数同時違反で先頭メッセージが変わる
  → Mitigation: スキーマのキー順を legacy のセクション順に揃える。既存テストは各ケース単一違反で、
  後段チェックはスキーマ成功後にのみ走るため、テスト対象の挙動は決定的。

- [Risk] zod parse の strip / coercion が返り値を変える → Mitigation: D2（validation-only、`raw` を返す）。

- [Risk] custom message の取りこぼしでメッセージ正規表現テストが落ちる → Mitigation: 全フィールドの
  legacy reason を tasks.md のインベントリで列挙し、multi-constraint は全 check に同一 message を付与。
  full test suite を実装の oracle とする。

- [Risk] `zod/v4-mini` の tree-shaking 方針（report-result.ts の手書き parseInput）との整合
  → Mitigation: config 検証は CLI 起動時に一度だけ走る経路であり、tool-call の hot path ではない。
  手書き parseInput 方針は `report_result` に限定された独立の決定（外部制約に明記）であり、config 検証への
  zod parse 採用とは独立。`zod/v4-mini` は既にバンドル済みで依存追加はゼロ。

- [Risk] no-code 例外 3 サイトの忠実再現を取りこぼすと store 経由 hint が drift → Mitigation: D3 と
  tasks.md の faithfulness テーブルで明示し、再現を検証する。

## Open Questions

- `version` / root 非オブジェクト / `pipeline.maxRetries` 範囲外の 3 サイトが `.code` を持たず store 経由で
  `CONFIG_INCOMPLETE` 扱いになるのは、範囲違反に対して「login せよ」という hint を返す既存の不整合である。
  本変更では現行挙動を忠実に維持する（scope 厳守）。`.code = CONFIG_INVALID` への統一は将来の独立変更の候補。
