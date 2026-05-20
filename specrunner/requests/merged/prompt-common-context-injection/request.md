# spec-runner 共通 prompt fragment を全 agent に強制注入する (= 規律と役割の主語分離)

## Meta

- **type**: spec-change
- **slug**: prompt-common-context-injection
- **base-branch**: main
- **adr**: true

## 背景

PR #339 (= npm-distributable-bin) で **ADR が 2 ファイル生成される事故** が発生した:

- adr-gen step: `specrunner/adr/2026-05-19-tsconfig-build-separation.md` (= 正規、新形式)
- 別 agent (= code-fixer 推定): `docs/adr/001-tsconfig-build-separation.md` (= 旧形式、誤生成)

直近 commit `048ce05` で「ADR 旧形式 → 新形式 (`specrunner/adr/<date>-<slug>.md`) に rename 統一」した規律に反する。同じ adr-gen prompt なのに **PR #340 では `specrunner/adr/` のみ正常生成、PR #339 だけ二重生成** という非決定的挙動。

### 根本原因

「**ADR 配置の真理**」が adr-gen prompt にのみ書かれており、他 agent (= code-reviewer / code-fixer 等) は **ADR 配置の真理を持っていない**。code-reviewer / code-fixer が tasks.md やコメントの「ADR を作成」を見て、自分で配置場所を **judgment** してしまう。

同型の事故は他にも:
- `AUTHORITY_SPEC_GUARD` を必須 fragment にしていない agent では authority spec への直接編集が発生 (= 過去事故、#262)
- `DELTA_SPEC_FORMAT` を知らない agent (= test-case-gen 等) が旧形式で書く可能性
- system path (= `~/.local/state/specrunner/logs/` 等) が agent ごとに散在

= **spec-runner 全体の規律 (= system 視点の真理) を全 agent に共通注入する仕組みが欠如**。memory `feedback_llm_uncertainty_principle` の system context 版。

## 思想

### 規律と役割の主語分離

| 種類 | 主語 / 視点 | 内容 | 配置 |
|---|---|---|---|
| **規律** | 3 人称 / system 視点 | spec-runner とは何か、全体構造、各 step の責務、場所の真理 | 共通 fragment (= 全 agent に強制注入) |
| **役割** | 1 人称 / agent 視点 | あなたは〜です、あなたの手順、自分の振る舞いの禁止事項 | 個別 prompt (= step ごと) |

「**こうしろ**」(= 具体手順) は個別 prompt で各 agent に、「**こうである / 責任範囲 / 真理**」(= 規律) は **全 agent 共通の prompt で強制注入** する。agent が「自分は何の system の中で動いているか」「他 agent との責務境界はどこか」を共通の前提として持つことで、他 agent の責務領域に踏み込む判断を構造的に減らす。

### 4 層の共通規律

1. **System context** (= spec-runner とは): pipeline 構造、step の独立性 (= 別 agent session)、CLI が orchestrate、artifact ファイル経由の連携
2. **思想原則**: agent は semantic content のみ、format / structure / classification / path は tool が決める、観察可能な事実を信用
3. **責任範囲**: 各 step (= design / implementer / spec-fixer / verification / code-review / code-fixer / adr-gen / pr-create) が触ってよい / 触ってはいけない領域を表で明示
4. **System facts**: 場所の真理 (= ADR = `specrunner/adr/<date>-<slug>.md`、authority spec = `specrunner/specs/<capability>/spec.md`、verbose log = `~/.local/state/specrunner/logs/<jobId>.log` 等)

## 要件

### 1. `SPEC_RUNNER_COMMON_CONTEXT` fragment の新設

- `src/prompts/fragments.ts` に新 fragment を追加
- 内容は上記 4 層を含む
- 3 人称 / system 視点で記述 (= 「あなたは〜」ではなく「spec-runner は ... である」「各 step は ... の責務を持つ」)

### 2. `buildSystemPrompt` の改修 (= 自動 prepend)

- `src/prompts/builder.ts` を改修し、`SPEC_RUNNER_COMMON_CONTEXT` を **全 agent base に強制 prepend** する
- 個別 agent 側で fragment 列挙不要 (= 漏れ防止、強制注入)
- optional fragment (= 既存の `AUTHORITY_SPEC_GUARD` / `COMMIT_DISCIPLINE` 等の一部) は従来通り個別 agent が指定可能

### 3. 既存個別 prompt から「規律」記述を削除

各 agent system prompt (= adr-gen / build-fixer / code-fixer / code-review / design / implementer / spec-fixer / spec-review / test-case-gen / request-review / request-generate) から以下の記述を削除する:

- 「パイプライン上の位置づけ / 次工程: ...」 (= system context、共通に集約)
- 「禁止事項: 責任範囲外の編集」 (= 責任範囲、共通に集約)
- 規律的な「authority spec 直接編集禁止」 (= 共通の AUTHORITY_SPEC_GUARD 統合範囲、details は本 request 内で決定)

各 prompt に残すのは「**1 人称 / agent 視点の役割と手順**」のみ:
- 「あなたは <step> です」
- 「あなたの手順: 1. ... 2. ...」
- 自分の振る舞いの禁止事項 (= 「デバッグ用の console.log を残さない」等)

#### 規律 vs 役割の判定表 (= 実装一貫性のため)

| 項目例 | 分類 | 配置 |
|---|---|---|
| 「パイプライン上の位置づけ / 次工程は verification」 | 規律 (= system context) | 共通 fragment |
| 「authority spec を直接編集してはならない」 | 規律 (= 責任範囲) | 共通 fragment |
| 「ADR は specrunner/adr/<date>-<slug>.md に配置する」 | 規律 (= system facts) | 共通 fragment |
| 「あなたは implementer です」 | 役割 (= 1 人称) | 個別 prompt |
| 「tasks.md を読んで実装する」 | 役割 (= 1 人称手順) | 個別 prompt |
| 「デバッグ用の console.log を残さない」 | 役割 (= 自分の振る舞い) | 個別 prompt |
| 「仕様変更や設計判断 (= 機械的修正者)」(= code-fixer / build-fixer) | 役割 (= 自分の振る舞い境界) | 個別 prompt |
| 「新機能の追加禁止」(= code-fixer / build-fixer) | 役割 (= 自分の振る舞い境界) | 個別 prompt |
| 「test_cases_skipped フォーマット」(= implementer) | 役割 (= 1 人称手順の細則) | 個別 prompt |

判定原則: 「**他 agent と共通か (= 規律)、自分固有の振る舞いか (= 役割)**」で分ける。判定が難しい境界は design 段で個別判断 (= ADR に分類根拠を記録)。

### 4. 既存 fragment との重複整理

既存 fragment (= `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT`) の規律相当部分は `SPEC_RUNNER_COMMON_CONTEXT` 内に統合し、既存 fragment は段階的に廃止 or 内容を絞る。具体的な統合方針 (= 完全廃止 / 部分維持 / rename) は design 段で決定 (= ADR に記録)。

`COMMIT_DISCIPLINE` / `PIPELINE_RULES` は規律ではなく **agent の振る舞いに関する具体ルール** なので、既存通り個別 agent が opt-in で指定する設計を維持する。

### 5. fragment-coverage test の更新

`tests/unit/prompts/fragment-coverage.test.ts` の対応表を以下のように update:

- 全 agent prompt に `SPEC_RUNNER_COMMON_CONTEXT` が含まれていることを assertion (= 強制注入の構造的検証)
- 既存 fragment (= AUTHORITY_SPEC_GUARD / DELTA_SPEC_FORMAT) の対応表は統合方針に合わせて update

### 6. 再現 test

PR #339 同型ケース (= 「ADR を生成せよ」という指示を受けた **adr-gen 以外の agent** が ADR 配置場所を judgment) で `SPEC_RUNNER_COMMON_CONTEXT` の system facts 層が catch することを test で検証する。

## スコープ外

- **tool 引数による強制** (= permission middleware / 専用 tool 化、別 issue で別構造変更)
- **agent 間の通信プロトコル変更** (= artifact ファイル経由は維持)
- **prompt cache 最適化** (= 副次効果として「全 agent に同じ prefix」で cache hit 率向上が見込まれるが、本 request では計測のみ)
- **`COMMIT_DISCIPLINE` / `PIPELINE_RULES` の共通化** (= これらは「振る舞いの具体ルール」で「規律」ではないため、本 request では touch しない)

## 受け入れ基準

- [ ] `SPEC_RUNNER_COMMON_CONTEXT` fragment が `src/prompts/fragments.ts` に新設され、4 層 (= system context / 思想原則 / 責任範囲 / system facts) を含む
- [ ] `SPEC_RUNNER_COMMON_CONTEXT` の文体が 3 人称 / system 視点で統一されている (= 「あなたは〜」が含まれない、unit test で検証)
- [ ] `buildSystemPrompt` が `SPEC_RUNNER_COMMON_CONTEXT` を全 agent base に自動 prepend する
- [ ] 全 agent prompt の system message に `SPEC_RUNNER_COMMON_CONTEXT` の核心部分 (= 例: 「spec-runner は」「各 step は」) が含まれていることを `fragment-coverage.test.ts` で assertion
- [ ] 個別 prompt から「パイプライン上の位置づけ」「責任範囲外の禁止」等の規律記述が削除され、1 人称 / agent 視点の役割と手順のみが残っている (= 各 agent prompt の文字数が削減されることを目安に確認)
- [ ] PR #339 同型ケース (= adr-gen 以外の agent が ADR 配置場所を判断しようとする) で本 fragment が catch することを再現 test で検証
- [ ] 既存 fragment (= `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT`) との重複整理が完了 (= 完全廃止 / 部分維持 / rename のいずれかが ADR に記録され実施されている)
- [ ] `tests/unit/prompts/builder.test.ts` が新 `buildSystemPrompt` 挙動 (= 自動 prepend) に合わせて更新され green
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「共通 prompt fragment の責務配置」「強制注入の方針」「既存 fragment との関係 (= 統合方針)」「規律と役割の主語分離原則」「境界判定の分類例」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
