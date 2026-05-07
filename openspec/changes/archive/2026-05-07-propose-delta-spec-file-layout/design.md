## Context

propose agent の system prompt (`src/prompts/propose-system.ts`) には PR #100 で delta spec のセクションヘッダールール (`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`) が追加された。しかしファイル配置規約が欠落しており、agent が `specs/<name>.delta.md` のようなフラットファイルを生成する問題が PR #98, #107 で繰り返し発生した。

また、PR #91 で openspec CLI ワークフロー、PR #100 で delta spec フォーマットルールを prompt に追加したが、`openspec/specs/propose-session/spec.md` にはこれらの Requirement が反映されていない。prompt と spec の乖離がある。

## Goals / Non-Goals

**Goals:**

- propose agent が delta spec を正しいディレクトリ構造 (`openspec/changes/<slug>/specs/<capability-name>/spec.md`) で生成するよう prompt にファイル配置ルールを追加する
- propose-session spec を prompt の現状と整合させ、openspec CLI ワークフロー・delta spec ルール・pre-commit validation の Requirement を追加する

**Non-Goals:**

- prompt の openspec CLI ワークフローセクション自体の改修（既に PR #91 で追加済み）
- openspec CLI 側のバリデーションロジック変更
- propose agent のモデルやツール構成の変更

## Decisions

### Decision 1: ファイル配置ルールを Delta Spec Format Rules セクションに追記する

prompt の既存 `## Delta Spec Format Rules (MUST)` セクションに「ファイル配置」サブセクションを追加する。セクションヘッダールールと同列に配置することで、agent が一箇所で全ルールを参照できる。

代替案: 別セクションとして独立させる → ルールの散在を避けるため却下。

### Decision 2: propose-session spec に ADDED Requirements として 3 つの Requirement を追加する

openspec CLI ワークフロー使用・delta spec フォーマットルール・pre-commit validation はいずれも既存 Requirement の変更ではなく、spec に記述されていなかった新規の振る舞い仕様である。MODIFIED ではなく ADDED とする。

## Risks / Trade-offs

- [prompt が長くなる] → ファイル配置ルールは 3-4 行程度のため許容範囲。agent の誤動作コスト（パイプライン失敗）の方が高い
- [spec と prompt の二重管理] → spec は「何を満たすべきか」の仕様、prompt は agent への指示。粒度が異なるため二重管理にはならない
