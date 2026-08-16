# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: Code Assertion Fact-Check

request.md に記載された全コードアサーションを Read ツールで直接確認した。

| アサーション | 確認結果 |
|---|---|
| `rules-resolve.ts:29` — `resolveStepRules` が `specrunner/rules/<step>/` を昇順列挙し、`string[]` を返す。frontmatter の概念は無い | ✅ 確認。行 29 が関数定義、返り値は `string[]`、frontmatter 処理なし |
| `rules-followup-prompts.ts:9-15` — wrap 文言(WRAP_PREFIX/WRAP_SUFFIX)、pure function | ✅ 確認。行 9 が WRAP_PREFIX、行 11-15 が WRAP_SUFFIX。I/O なし |
| `step-context-builder.ts:85-96` — `resolveStepRules` → `buildRulesFollowUpPrompts` → `allFollowUpPrompts`。配送経路はこの 1 本のみ | ✅ 確認。行 85-95 が一連のフロー。AgentRunContext の `policy.postWorkPrompts` に格納される |
| `agent-runner.ts:525-546` — main prompt 組み立て順: baseMessage → artifactSection → touchedFilesSection → resumeSection → additionalInstructions → firstTurnCompletionDirective | ✅ 確認。行 521-554 が正確にこの順序。`baseFullPrompt` に additionalInstructions が付き、その後 `firstTurnCompletionDirective` が末尾に付く |
| `agent-runner.ts:955-` — postWork prompts は main turn 後に `resume: sessionId` で実行 | ✅ 確認。行 1030-1046 が `postWorkPrompts` ループ。`resume: extractedSessionId` を使用 |
| `specrunner/rules/implementer/02-test-command.md` — 行動制約型ルールの実例。現在 frontmatter なし | ✅ 確認。ファイルは存在し `bun test` 禁止の内容。frontmatter なし |
| ADR `2026-05-24-per-step-rule-followup.md` — D1(frontmatter なし・CLI 非解釈)/D2(N 段 follow-up)/D3(wrap 3 要素制約) | ✅ 確認。各 Decision が明確に記載されている |

### Step 2: ADR との整合性確認

- ADR D1「ファイルの中身は完全自由文。frontmatter なし。CLI は中身を解釈・検証しない」への例外追加として、request は「delivery は内容ではなく配送 metadata」と明示している。論理的に整合する。
- ADR D2「N 段 follow-up」に prompt 配送の軸を追加する形であり、既存の follow-up 機構は不変。後方互換性の主張は妥当。
- ADR D3「wrap 3 要素制約」は follow-up 配送にのみ適用。prompt 配送には別 framing を定義するとしており、D3 と衝突しない。

### Step 3: 受け入れ基準の検証可能性確認

| 受け入れ基準 | 検証可能性 |
|---|---|
| `delivery: prompt` のルールが main work prompt の resume context より後・completion directive より前に含まれることをテストで固定する | テスト可能（adapter 単体テストで prompt 文字列の順序を assert） |
| `delivery: prompt` のルールが follow-up prompts に含まれないことをテストで固定する | テスト可能 |
| `delivery: followup` / 未指定のルールが postWork follow-up だけに配送されることをテストで固定する | テスト可能 |
| 未知の `delivery` 値が設定エラーで fail することをテストで固定する | テスト可能 |
| frontmatter が agent へ渡る本文から除去されることをテストで固定する | テスト可能 |
| `02-test-command.md` が `delivery: prompt` を宣言していること | 静的確認で対応可能 |
| ADR refine が architecture 上に存在すること | 静的確認で対応可能 |
| `typecheck && test` が green | CI で確認可能 |

### Step 4: `rules new` コマンドの現状確認

- `src/core/command/rules-new.ts` を確認。現在の `RULE_TEMPLATE` には `delivery` frontmatter の説明がない。
- `RULES_USAGE` にも `delivery` 宣言の説明がない。
- `tests/unit/core/command/rules-new.test.ts` — TC-RULES-010 が template 内容をテストしているが、`delivery` 説明の追加は要件 7 で明示されているにもかかわらず受け入れ基準に対応するチェックボックスがない。

### Step 5: provider 中立性の確認

- managed-agent adapter の `agent-runner.ts` を確認。prompt 組み立ては `step.buildMessage()` → `projectContext` → `resumePrompt` → `buildManagedGitPushInstruction` の順。`firstTurnCompletionDirective` に相当する要素がない。
- request は「completion directive の位置は adapter ごとに異なるため、配置だけを adapter 責務にする」と明示しており、managed adapter での配置は設計フェーズで決定される設計判断として適切に先送りされている。

## 検証できなかった項目

None — request.md に記載された全コードアサーション・ファイルパス・ADR 内容を確認した。

## Findings 詳細

### Finding 1: 要件 7 (`rules new` 追随)が受け入れ基準に欠落している

要件 7 は「scaffold テンプレートと usage テキストに delivery 宣言の説明を追加する」と明示的に scope 内に定義されている。しかし、8 つの受け入れ基準チェックボックスに対応する項目がない。

TC-RULES-010 が template 内容をテストしているため、実装者が template を更新すれば既存テストを修正する機会はある。しかし、criteria に明示されていないため以下のリスクがある:
- template コメントへの `delivery` 説明追加が見落とされる
- RULES_USAGE への説明追加が見落とされる

**推奨**: 受け入れ基準に「`rules new` が生成するテンプレートと usage テキストに `delivery` 宣言の説明が含まれること」を追加する。
