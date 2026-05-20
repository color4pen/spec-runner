# ADR: Common Prompt Fragment for Structural Context Injection

- **Date**: 2026-05-20
- **Status**: Accepted
- **Slug**: prompt-common-context-injection

## Context

PR #339 で ADR が 2 ファイル生成される事故が発生した（adr-gen の正規パス `specrunner/adr/` と、code-fixer が誤生成した旧形式パス `docs/adr/`）。根本原因は「ADR 配置の真理」が adr-gen prompt にのみ存在し、他 agent が path を知らないまま judgment したこと。

同型の事故は他にも発生しており（#262: authority spec 直接編集）、spec-runner 全体の規律を全 agent に共通注入する仕組みが欠如していた。

## 共通 prompt fragment の責務配置

`SPEC_RUNNER_COMMON_CONTEXT` fragment を新設し、以下の 4 層で構成する:

| Layer | 内容 |
|-------|------|
| Layer 1: System context | pipeline 構造、step の独立性、CLI がオーケストレーション |
| Layer 2: 思想原則 | agent は semantic content のみ担当、format/path は tool が決定 |
| Layer 3: 責任範囲 | 各 step の touch 可能 / 禁止領域の表 |
| Layer 4: System facts | 場所の真理（ADR path, authority spec path, delta spec path 等） |

## 強制注入の方針

`buildSystemPrompt(base, fragments[])` の内部実装を変更し、`SPEC_RUNNER_COMMON_CONTEXT` を全 agent base に自動 prepend する。

```
Before: [base, ...fragments].join("\n\n")
After:  [SPEC_RUNNER_COMMON_CONTEXT, base, ...fragments].join("\n\n")
```

外部 API (signature) は変更しない。`buildSystemPrompt` を経由する限り全 agent に自動注入される。`common-context-catch.test.ts` で構造的保証を検証する。

## 既存 fragment との関係 (統合方針)

| Fragment | 方針 | 理由 |
|----------|------|------|
| `AUTHORITY_SPEC_GUARD` | 縮小維持（書く側の規律・見る側の規律のみ） | 全 agent 共通 MUST NOT は Layer 3 に移行 |
| `DELTA_SPEC_FORMAT` | 縮小維持（フォーマット詳細のみ） | 冒頭文 "ADDED/MODIFIED の分類は agent がしない" は Layer 2 に移行 |
| `COMMIT_DISCIPLINE` | 変更なし（opt-in 維持） | 振る舞いルールであり規律ではない |
| `PIPELINE_RULES` | 変更なし（opt-in 維持） | code-review / spec-review 固有のルール |

## 規律と役割の主語分離原則

| 種類 | 主語 / 視点 | 内容 | 配置 |
|------|------------|------|------|
| 規律 | 3 人称 / system 視点 | spec-runner とは何か、全体構造、各 step の責務、場所の真理 | SPEC_RUNNER_COMMON_CONTEXT（全 agent に強制注入） |
| 役割 | 1 人称 / agent 視点 | あなたは〜です、あなたの手順、自分の振る舞いの禁止事項 | 個別 prompt (step ごと) |

判定原則: 「他 agent と共通か（= 規律）、自分固有の振る舞いか（= 役割）」で分ける。

## 境界判定の分類例

| 項目例 | 分類 | 配置 |
|--------|------|------|
| 「パイプライン上の位置づけ / 次工程は verification」 | 規律 (system context) | 共通 fragment |
| 「authority spec を直接編集してはならない」 | 規律 (責任範囲) | 共通 fragment |
| 「ADR は specrunner/adr/<date>-<slug>.md に配置する」 | 規律 (system facts) | 共通 fragment |
| 「あなたは implementer です」 | 役割 (1 人称) | 個別 prompt |
| 「tasks.md を読んで実装する」 | 役割 (1 人称手順) | 個別 prompt |
| 「デバッグ用の console.log を残さない」 | 役割 (自分の振る舞い) | 個別 prompt |
| 「新機能の追加禁止」(build-fixer / code-fixer) | 役割 (振る舞い境界) | 個別 prompt |

## Consequences

- 全 agent が spec-runner の構造、責任範囲、path の真理を共有する
- `buildSystemPrompt` を経由する限り新 agent 追加時に漏れなく規律が適用される（構造的保証）
- 個別 prompt から規律記述が削除され重複がなくなる
- prompt cache hit 率の向上が副次効果として期待できる（全 agent が同一 prefix を持つ）

## Files Changed

| File | Change |
|------|--------|
| `src/prompts/fragments.ts` | `SPEC_RUNNER_COMMON_CONTEXT` 新設、`AUTHORITY_SPEC_GUARD` 縮小、`DELTA_SPEC_FORMAT` 縮小 |
| `src/prompts/builder.ts` | `SPEC_RUNNER_COMMON_CONTEXT` 自動 prepend |
| `src/prompts/implementer-system.ts` | 規律記述削除 |
| `src/prompts/design-system.ts` | 規律記述削除 |
| `src/prompts/code-review-system.ts` | 規律記述削除 |
| `src/prompts/code-fixer-system.ts` | 規律記述削除 |
| `src/prompts/build-fixer-system.ts` | 規律記述削除 |
| `src/prompts/adr-gen-system.ts` | 規律記述削除 |
| `src/prompts/spec-fixer-system.ts` | 規律記述削除 |
| `src/prompts/test-case-gen-system.ts` | `buildSystemPrompt` 経由に移行 |
| `src/prompts/request-generate-system.ts` | `buildSystemPrompt` 経由に移行 |
| `src/prompts/request-review-system.ts` | `buildSystemPrompt` 経由に移行 |
| `tests/unit/prompts/common-context-catch.test.ts` | PR #339 同型ケース再現テスト (新規) |
