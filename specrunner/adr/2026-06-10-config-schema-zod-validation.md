# ADR: config スキーマ検証に zod/v4-mini を採用する

**Date**: 2026-06-10
**Status**: Accepted
**Request**: config-schema-zod-migration

## Context

`src/config/schema.ts` の `validateConfig` は 500 行超の手書き検証で、config にフィールドを追加するたびに TypeScript interface と検証ロジックを手動で同期する必要があり、検証漏れのリスクがあった。

zod は `zod@4.4.3`（`zod/v4-mini`）として既存依存に存在し、`report-tool.ts` の tool schema 生成で使用実績がある。一方、`src/core/port/report-result.ts` の `parseInput` は tree-shaking 安定性のため意図的に手書き（no zod parse）としており、zod 採用は tool schema に限定するという暗黙の方針があった。

本変更はその方針を改め、config 検証への zod 採用を明示的に決定する。

## Decision 1: zod/v4-mini を config 検証に採用する

### 決定

`validateConfig` の手書き型チェック連鎖を zod/v4-mini スキーマ検証に置き換える。「tool schema のみ」という従来の暗黙方針を廃止し、config 検証も zod の使用対象とする。

### 根拠

- 手動同期コスト（検証漏れリスク）> 依存追加コスト（ゼロ：既存依存）
- `report_result` の手書き parseInput 方針は tree-shaking hot path に固有の制約であり、CLI 起動時に 1 度走る config 検証とは独立した判断

### 却下した代替案

| 案 | 却下理由 |
|---|---|
| 手書きのまま関数分割のみ | 型と検証ロジックの情報源が二重のまま。手動同期コストが残る |
| 全依存を排除した独自スキーマライブラリ導入 | 既存依存で解決できる問題に新依存を追加する理由がない |

## Decision 2: 2 層バリデータ（zod 構造スキーマ + 後段セマンティックチェック）

### 決定

`validateConfig` を次の 2 層に再構成する:

1. **zod 構造スキーマ**（`configSchema`）— 型・範囲・enum・必須/任意を宣言的に定義し、`safeParse` で評価する
2. **後段セマンティックチェック** — スキーマ検証成功後にのみ実行する独立関数群（model registry チェック・byRequestType セマンティクス等）

### 根拠

スキーマで表現しにくい条件（外部データ依存、非 throw の warning、1-level 制約）を後段に分離することで、スキーマは「形」だけを担い、`if-then` 連鎖を持たない線形フローを実現する。

### 却下した代替案

| 案 | 却下理由 |
|---|---|
| 全規則を zod refine で 1 スキーマに詰め込む | external state 依存と error path/message 制御が複雑になる |

## Decision 3: validation-only（parse 出力を返さず元の raw を返す）

### 決定

zod スキーマは検証専用とし、`validateConfig` の返り値は zod parse 出力ではなく元の migrated オブジェクト（`raw as SpecRunnerConfig`）とする。

### 根拠

zod の `object` は未知キーを strip するため、parse 出力を返すと `jobs.location` 等のレガシーフィールドが消える。検証専用にすることで coercion / strip / default 注入の副作用を持ち込まず、現行の passthrough 挙動を維持する。

### 却下した代替案

| 案 | 却下理由 |
|---|---|
| parse 出力を返し passthrough モードで未知キーを保持 | v4-mini の passthrough 挙動への依存が増える。検証専用の方が同値性が高い |

## Decision 4: エラー翻訳層で既存エラー契約を維持する

### 決定

`safeParse` 失敗時、`error.issues[0]` を 1 件取り出して既存の `CONFIG_INVALID: <path> <reason>.` 形式の `Error` に翻訳する。各スキーマノードに legacy reason と一致する custom message を付与し、store / exit-code / hint の写像を変えない。

3 つの no-code 例外サイト（root 非オブジェクト・version ガード・`pipeline.maxRetries` 範囲外）は現行挙動を忠実に再現する（`.code` 無し → store 経由で `CONFIG_INCOMPLETE` 扱い）。

### 根拠

store / exit-code の写像はメッセージ prefix と `.code` の有無に依存している。既存テストはメッセージ正規表現で検証しており、忠実再現がテスト無改変 green の唯一の方法。

### 却下した代替案

| 案 | 却下理由 |
|---|---|
| zod 既定メッセージをそのまま露出 | 機械可読 code + 人向け hint への変換要件に反し、テストが落ちる |
| no-code 例外も一律 `.code = CONFIG_INVALID` に統一 | store 経由 hint が変わりエラー契約が drift する |

## Decision 5: interface ↔ スキーマの整合をコンパイル時アサーションで束縛する

### 決定

既存の公開 interface（`SpecRunnerConfig` 等）を維持しつつ、スキーマの推論型と interface の構造的整合を TypeScript のコンパイル時アサーションで強制する。

### 根拠

interface を `z.infer` で全面置換すると `version: 1` リテラルや JSDoc が失われ、リポジトリ全域の import 先 type が変わって影響範囲が `src/config/` を超える。コンパイル時アサーションにより、痛点（手動同期）を解消しつつ blast radius を `src/config/` に閉じる。

### 却下した代替案

| 案 | 却下理由 |
|---|---|
| interface を z.infer で全面置換 | blast radius 過大。リポジトリ全域の import 先 type が変わる |
| 整合チェック無しでスキーマと interface を併存 | 再び手動同期に戻る |

## Consequences

### Positive

- フィールド追加時は zod スキーマへの宣言追加のみで検証・型が同期される
- `validateConfig` が線形フローになり、500 行の `if-then` 連鎖が消える
- スキーマで表現しにくい条件は後段の独立関数として追加でき、スキーマが肥大化しない

### Neutral

- `report_result` の手書き parseInput 方針は独立して維持される
- no-code 例外 3 サイト（`CONFIG_INCOMPLETE` にフォールバックする既存の不整合）は現行挙動を維持。`.code = CONFIG_INVALID` への統一は将来の独立変更の候補
