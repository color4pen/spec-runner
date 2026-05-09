## Context

`specrunner finish` の Phase 0 で `openspec validate --strict` を実行するが、propose agent が生成する delta spec が validation に失敗するケースが繰り返し発生している。原因は propose agent の system prompt（`src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT`）に、openspec validate が検査する一部のルールが記載されていないこと。

現状の prompt には「Delta Spec Format Rules (MUST)」セクション（L93-141）が既に存在し、以下は記載済み:
- 各 Requirement は `### Requirement:` で始まる header を持つこと
- 各 Requirement は少なくとも 1 つの `#### Scenario:` を含むこと
- MODIFIED Requirements の header 一致ルール
- 独自フォーマット禁止

一方、以下は**欠落**している:
1. requirement 本文に英語の `SHALL` または `MUST` を含めること
2. requirement ヘッダーと `#### Scenario:` の間にコードブロックを挟まないこと

## Goals / Non-Goals

**Goals:**
- propose agent の system prompt に欠落している openspec validate ルール 2 件を追記する
- 既存の prompt 構造・テキストを変更しない（追記のみ）

**Non-Goals:**
- openspec validate 自体のロジック修正
- spec-fixer による delta spec 自動修正機構
- prompt の大規模リファクタリング

## Decisions

### 1. 既存の「Delta Spec Format Rules (MUST)」セクション内にルールを追加する

**選択**: 既存セクションのルールリスト（番号付き）に 2 項目を追記する。

**理由**: 新セクションを増やすと prompt が散在して agent の注意が分散する。同一セクションに集約することで一貫性を保つ。

**代替案**: 別セクション「openspec validate Rules」を新設 → 重複が生じ、既存の Self-review checklist との整合性も崩れるため却下。

### 2. Self-review checklist にも対応項目を追加する

**選択**: checklist にも新ルールに対応するチェック項目を追記する。

**理由**: prompt 内に checklist が存在し、agent が commit 前に確認する構造になっている。ルールだけ追加して checklist を更新しないと agent が見落とす。

## Risks / Trade-offs

- [Prompt 長の増加] → 2 ルール + 2 checklist 項目の追記で数行程度。影響は軽微
- [既存テストの破損] → prompt 文字列を検証するスナップショットテストがあれば更新が必要。tasks.md で確認・対応を指示する
