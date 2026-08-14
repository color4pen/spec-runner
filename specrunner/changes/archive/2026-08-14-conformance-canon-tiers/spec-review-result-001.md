# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md の整合性確認

- 背景・要件・スコープ外・受け入れ基準・architect 評価済み設計判断を通読した。
- 要件 1〜4 が明確かつ相互に矛盾していないことを確認した。
- スコープ外の列挙（conformance step の廃止・verdict 導出ロジック変更・他 review ステップへの影響・design/tasks の形式変更）が要件と衝突していないことを確認した。
- 受け入れ基準 6 件がそれぞれ spec.md の Requirement / Tasks の受け入れ基準と対応していることを確認した。

### 2. spec.md の形式・内容確認

- 全 Requirement が `### Requirement:` heading を持つことを確認した（4 件）。
- 全 Requirement が少なくとも 1 つの `#### Scenario:` を持つことを確認した（5 シナリオ）。
- Requirement 本文に MUST または SHALL が含まれていることを確認した（全 4 件）。
- 全 Scenario が Given/When/Then 形式で記述されていることを確認した。

### 3. request → spec の対応確認

| request 要件 | 対応する spec Requirement |
|-------------|--------------------------|
| 要件 1: 二層の宣言 | Requirement: conformance prompt は request/spec を規範、design/tasks を計画として二層宣言する |
| 要件 2: 判定基準の置換 | Requirement: design/tasks との相違はそれ自体では finding にせず、finding の根拠は request/spec を引く |
| 要件 3: 完了性の確認は維持 | Requirement: 受け入れ基準と Requirement/Scenario の全件充足確認を維持する |
| 要件 4: 機械意味論は不変、agent 向け説明は追随 | Requirement: fixTarget enum と verdict 集約の機械意味論は不変である（2 Scenario） |

全 4 要件が spec Requirement にカバーされている。

### 4. spec → design の対応確認

- D1（prompt 層のみで変更）が要件 1・4 に対応している。
- D2（判定基準の置換、non-blocking note）が要件 2 に対応している。
- D3（完了性確認の維持）が要件 3 に対応している。
- D4（routing 説明の文面更新、fixTarget enum は不変）が要件 4 に対応している。
- D5（buildMessage の追随）が要件 4 の「agent 向け説明の追随」に対応している。
- D6（anchor 文字列の固定）が受け入れ基準「テストによる固定」に対応している。
- D7（既存テストの全列挙、更新対象 0 件）が受け入れ基準「列挙外は無変更で green」に対応している。

### 5. design → tasks の対応確認

- T-01 が D1・D2・D3・D6 を実装する（CONFORMANCE_SYSTEM_PROMPT の書き換え）。
- T-02 が D4 を実装する（CONFORMANCE_REPORT_TOOL.description の更新）。
- T-03 が D5 を実装する（buildMessage の追随）。
- T-04 が D6 のテストを実装する（新規テスト追加）。
- T-05 が typecheck + test の green 確認を担う。
- 全 D（D1〜D7）が T-01〜T-05 でカバーされている。

### 6. anchor 文字列の検証可能性確認

D6 に定義された anchor 文字列を spec Scenario・T-04 と照合した:

| anchor | spec Scenario | T-04 pin | 形式 |
|--------|--------------|----------|------|
| `規範（normative）` | ✓ | ✓ | 全角括弧 |
| `計画・根拠（plan / rationale）` | ✓ | ✓ | 全角括弧 |
| `それ自体では finding にしない` | ✓ | ✓ | |
| `finding の根拠には request.md / spec.md` | ✓ | ✓ | |
| `non-blocking note` | ✓ | ✓ | |
| `全件確認` | ✓（単一 toContain） | ✓ | 後述注記参照 |

anchor が distinctive な複数語部分文字列であり、偶発一致のリスクが低いことを確認した。

### 7. D7 既存テスト全列挙の検証

`conformance.test.ts`・`prompt-skeleton-drift-guard.test.ts`・`judge-verdict-conformance.test.ts` を読み、D7 表の主要な主張を検証した:

- `TC-012`: 4 成果物名を参照 → 二層化後も全名称を残す設計のため green 維持 ✓
- `TC-CONF-01`: `CONFORMANCE_REPORT_TOOL.description` が `fixTarget` を含む → T-02 で明示的に維持 ✓
- `TC-CONF-03`: prompt が fixTarget + 3 routing target を含む → T-01 AC に明示 ✓
- `TC-001`: 5 節見出し順序 → 節内文面のみ書き換えるため green 維持 ✓
- `TC-011`: `CONFORMANCE_RESULT_TEMPLATE` が `## 検証した項目` を含む → template 未変更（D2） ✓。テンプレートを直接読み確認。
- `TC-015`: `CONFORMANCE_SYSTEM_PROMPT` が `SEVERITY_DEFINITION` を含む → `${SEVERITY_DEFINITION}` を保持 ✓
- `TC-JVCONF-01〜09`: `deriveConformanceVerdict` + `aggregateFixTarget` → `judge-verdict.ts` 未変更 ✓

D7 が主張する「更新対象の既存テストは 0 件」は正確と判断した。

### 8. セキュリティ観点

本変更は prompt の文面変更のみ（`src/prompts/conformance-system.ts`・`src/core/step/conformance.ts` buildMessage・`src/core/step/report-tool.ts` description）。新規ユーザー入力受け口・認証経路・外部 API 呼び出しは発生しない。OWASP Top 10 適用範囲なし。

### 9. 既存コードとの整合確認

`src/prompts/conformance-system.ts`（現行）を読み確認:
- L20-25: 4 成果物を並列に「正典」と記述 → 要件 1 の変更対象として正確に識別 ✓
- L37-47: tasks 全 checkbox・design 全 decision・spec/request の順序 → 要件 2 の変更対象として正確に識別 ✓
- L72-77: routing 表 → 要件 4 の変更対象として正確に識別 ✓

`src/core/step/conformance.ts` buildMessage L85: `verify all checkboxes are marked complete [x]` → D5・T-03 の変更対象として正確に識別 ✓

`src/core/step/report-tool.ts` L180: `fixTarget routing: 'spec-fixer' = spec/design artifact is wrong; ...` → T-02 の変更対象として正確に識別 ✓

`CONFORMANCE_RESULT_TEMPLATE` を直接確認: `## 検証した項目` を含み verdict 導出パターンなし → D2・TC-011 の主張通り ✓

## 検証できなかった項目

anchor `全件確認` が prompt 内で **request 受け入れ基準と spec Requirement/Scenario の両方** に付されることは、spec Scenario（単一の `toContain`）と T-04 の assertion では出現回数を機械的に検証しない。T-01 のチェックリストには両箇所への記載が明記されており、実装とPRレビューに委ねる形となる。機能的影響は低い（どちらも同じ意味の全件確認であるため）。

## Findings 詳細

None
