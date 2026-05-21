# Design: prevent-authority-path-in-request-body

## 概要

request 作成フローの 3 箇所に authority path 直接指定の防衛を追加する。
prompt 修正のみ（ランタイムコード変更なし）で、既存の executor 側 guard（PR #294）と合わせて create → execute の両段階で防御する。

## 設計判断

### DJ-1: prompt テキストへの直接埋め込み vs fragment 分離

**判断: 直接埋め込み**

理由:
- `AUTHORITY_SPEC_GUARD` は executor 側 agent（implementer / spec-fixer / code-review 等）用のフラグメント。request-generate と request-review は異なる文脈（request 作成側）で動作し、guard の「書く側の規律」「見る側の規律」とは別の関心事
- request-generate に必要なのは「authority path を書くな」の 1 ルール。request-review に必要なのは「authority path + 編集動詞の共起検出」の 1 ルール。いずれも短く、fragment に切り出す再利用性がない
- 将来 fragment 化が必要になった時点で抽出すればよい（YAGNI）

### DJ-2: request-review の検出方法 — 正規表現 vs LLM 判断

**判断: prompt 内の自然言語ルールで LLM に判断させる**

理由:
- request-review は LLM agent が request.md を読んでレビューする仕組み。検出ロジックは prompt のルール記述で十分
- 正規表現による静的検出は `request validate` サブコマンドの責務。今回のスコープ外（dsv 拡張として別議論）
- prompt に「authority path pattern + 編集動詞の共起 → HIGH finding」のルールを追加するだけで、既存の review フローに乗る

### DJ-3: テスト戦略 — prompt 文字列の contains assertion

**判断: 既存パターン踏襲（string contains assertion）**

理由:
- 既存の `tests/unit/command/request-review.test.ts` が `REQUEST_REVIEW_SYSTEM_PROMPT` の構造を verify する先例
- prompt の文字列に特定のルール記述が含まれることを assert する。prompt を変更して検出ルールを削除した場合に regression として検知できる
- LLM の出力品質テスト（= 実際に authority path を含む request を食わせて HIGH finding が出るか）はスコープ外

## 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `src/prompts/request-generate-system.ts` | Output Rules セクションに authority path 禁止の MUST ルールを追加 |
| `src/core/command/request.ts` | `buildScaffoldTemplate` に delta spec path guidance のコメントを追加 |
| `src/prompts/request-review-system.ts` | Step 2 に authority path 共起検出ルールを HIGH severity として追加 |
| `tests/unit/command/request-review.test.ts` | prompt 文字列 contains assertion を 2 件追加 |

## 変更しないもの

- `src/prompts/fragments.ts`（AUTHORITY_SPEC_GUARD は executor 側の guard、今回は request 作成側の防衛）
- ランタイムコード（parser / validator / pipeline）
- 既存テストの変更
