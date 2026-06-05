# Tasks: request review を構造化 JSON 一本にする

## T-01: reviewer system prompt を JSON-only 契約に単純化する

- [x] `src/prompts/request-review-system.ts` の `## Output Format` 節（現状 L94–142）を書き換える。
  - [x] `### 1. Findings Summary Table`（`## Findings Summary` Markdown 表）サブ節を削除する。
  - [x] `### 2. Verdict`（`## Verdict:` 見出し ＋ 要約）サブ節を削除する。
  - [x] 末尾の ```json ブロックを **唯一の REQUIRED 出力 artifact** として残す。
  - [x] categories の列挙、field semantics（`number` は 1-indexed、`location`/`recommendation` は optional・省略可、
        `summary` は `#N` 参照を使う）、「JSON block MUST be the last block」を保持する。
- [x] `## Constraints` 節（現状 L155–163）から二重出力の一致強制を外す。
  - [x] 「The verdict in the JSON block MUST match the `## Verdict:` heading.」を削除する。
  - [x] 「findings array in JSON must correspond to the Findings Summary table …」を削除する。
  - [x] 「summary in JSON should be the same 1-3 sentence explanation from the Verdict section.」を削除する。
  - [x] 「Do NOT propose code implementations」「Do NOT modify any files」「JSON block MUST be the last thing」
        「実装設計（クラス境界・API 契約・内部 trade-off）を findings に含めない」は保持する。
- [x] JSON が出力の主成分であり、JSON ブロック手前の散文（前置き）は最小限にする旨を prompt に明示する（D2）。
- [x] Review Process（Step 1–5）・Severity Scope Constraint・Exclusion Clause・
      Project-Specific Design Perspective・Verdict Derivation Rules の各節は変更しない。

**Acceptance Criteria**:
- system prompt が `## Findings Summary` Markdown 表・`## Verdict:` 見出しの出力を要求しない。
- ```json ブロックが唯一の必須出力 artifact になっている。
- prompt 内容 assert テスト（`tests/unit/command/request-review.test.ts` の TC-RR-015〜018）が依然 green。
- `bun run typecheck` が green。

## T-02: parseReviewOutput の fallback を「parse 失敗と判別できる」表現にする

- [x] `src/core/request/reviewer.ts` の fallback 分岐（L82–93）で `summary: text.slice(0, 500)` を
      **固定の診断文字列**に置き換える（入力長・内容に依存しない定数。「構造化 JSON としてパースできなかった、
      これは確定 verdict ではない」旨）。
- [x] parse-error finding（`category: "parse-error"`、`severity: "HIGH"`、`number: 1`）は必ず含める（現状維持）。
- [x] raw reviewer text を `summary` にも finding の各 field にも一切埋め込まない。
- [x] verdict は `"needs-discussion"` のまま据え置く（新 verdict 値を作らない、`RequestReviewVerdict` union 不変）。
- [x] 正常系（最後の ```json を読む）と `formatHumanReadable`・`verdictToExitCode` は変更しない。

**Acceptance Criteria**:
- JSON 欠落・malformed JSON・truncation した JSON のいずれの入力でも、`result.summary` が固定診断文
  （入力に依存しない）になり、`findings` に `category: "parse-error"` の finding が必ず含まれる。
- fallback の `summary` / findings に raw reviewer text が echo されない。
- `verdictToExitCode` のマッピングと `formatHumanReadable` の表示形式が baseline から不変。

## T-03: 既存ユニットテストを更新し truncation ケースを追加する

- [x] `tests/unit/core/request/reviewer.test.ts` と `tests/unit/command/request-review.test.ts` の
      「JSON 欠落 fallback」テストの assertion `expect(result.summary).toBe(text.slice(0, 500))`
      （それぞれ L76 / L75）を更新する。
  - [x] 固定診断 summary を assert する。
  - [x] `result.summary` が raw 入力テキストを含まないことを assert する。
- [x] **truncation / 不完全 JSON** の決定的テストを追加する。
  - [x] ```json fence が開いたまま本体が途中で切れた入力（閉じ波括弧・閉じ fence 無し）を与える。
  - [x] fallback path に落ち、verdict が確定扱いされず、parse-error finding を含み、raw echo が無いことを検証する。
- [x] JSON 欠落・malformed・truncation のすべてで parse-error finding が必ず存在することを assert する。
- [x] 正常な末尾 JSON 入力で verdict/findings/summary が正しくパースされることの既存検証は維持する。
- [x] すべて決定的・LLM 不要。

**Acceptance Criteria**:
- 正常末尾 JSON・JSON 欠落・malformed JSON・truncation JSON の各入力に対する挙動が決定的に検証されている。
- 旧 echo assertion が新挙動と矛盾せず、`bun run test` が green。

## T-04: 不変条件を確認し検証ゲートを通す

- [x] `formatHumanReadable` の表示形式（`## Verdict:` 見出し ＋ summary ＋ findings 形式）が baseline から不変であることを確認する。
- [x] `verdictToExitCode` のマッピング（approve/needs-discussion → 0、reject → 1）が不変であることを確認する。
- [x] `bun run typecheck && bun run test` を実行する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- `formatHumanReadable` と `verdictToExitCode` が baseline から変更されていない。
