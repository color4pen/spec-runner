# Spec: code-fixer への approved 時 routing を findings から導出する

## Requirements

### Requirement: approved 後の code-fixer routing は findings の fixable 件数から決まる

code-review の verdict が `approved` のとき、code-fixer（observation-fix パス）へ遷移するか
conformance へ直行するかは、直前 code-review run の `toolResult.findings` に含まれる
`resolution: "fixable"` の finding 件数のみから決定する SHALL。agent 申告の
`toolResult.fixableCount` を routing 判定に使用してはならない MUST NOT。

- `resolution: "fixable"` の finding が 1 件以上 → code-fixer
- `resolution: "fixable"` の finding が 0 件（findings 不在を含む）→ conformance

approved 到達時点では `deriveJudgeVerdict` の不変条件により critical/high および decision-needed の
finding は存在しないため、対象は実質 low/medium の fixable findings である。

#### Scenario: approved + fixable findings あり → code-fixer

**Given** 直前 code-review run の toolResult が `{ ok: true, findings: [{ severity: "low", resolution: "fixable", ... }] }` を持ち verdict が approved
**When** pipeline が approved の遷移先を決定する
**Then** code-fixer へ遷移する（approved → code-fixer の `when` 述語が true を返す）

#### Scenario: approved + fixable findings なし → conformance

**Given** 直前 code-review run の toolResult が `{ ok: true, findings: [] }` を持ち verdict が approved
**When** pipeline が approved の遷移先を決定する
**Then** conformance へ遷移する（approved → code-fixer の `when` 述語が false を返し、fallback 行が採用される）

#### Scenario: fixableCount と findings が矛盾するとき findings に従う

**Given** 直前 code-review run の toolResult が `{ ok: true, fixableCount: 0, findings: [{ resolution: "fixable", ... }] }`（fixableCount=0 だが fixable finding あり）を持つ
**When** pipeline が approved の遷移先を決定する
**Then** `when` 述語は true を返し code-fixer へ遷移する（fixableCount=0 ではなく findings に従う）

#### Scenario: fixableCount だけ残る旧 state は findings 不在で conformance に倒れる

**Given** 直前 code-review run の toolResult が `{ ok: true, fixableCount: 3 }`（findings フィールド不在）を持つ
**When** pipeline が approved の遷移先を決定する
**Then** `when` 述語は false を返し conformance へ遷移する（findings が無い限り code-fixer に回さない）

### Requirement: fixable findings の集計は純関数として提供される

approved 後の routing 判定に使う「`resolution: "fixable"` の finding 抽出」は、
`src/core/step/judge-verdict.ts` の純関数（副作用・I/O を持たない）として提供する SHALL。
verdict 集計（`deriveJudgeVerdict` 等）と同じモジュール・同じ規約に従う。

#### Scenario: fixable のみを抽出する

**Given** `[{ resolution: "fixable" }, { resolution: "decision-needed" }, { resolution: "fixable" }]` の findings
**When** 集計純関数を呼ぶ
**Then** `resolution: "fixable"` の 2 件のみを返し、`decision-needed` は含まない

#### Scenario: 空入力は空を返す

**Given** 空の findings 配列
**When** 集計純関数を呼ぶ
**Then** 空配列を返す（routing 判定では false 相当）

### Requirement: code-review tool description は fixableCount の申告を要求しない

CODE_REVIEW_REPORT_TOOL の model に送られる description は `fixableCount` への言及を含んではならない
MUST NOT。ただし後方互換のため、`fixableCount` の zod スキーマフィールドおよび
`parseCodeReviewReportInput` の受け口は残す SHALL（受け取っても routing には使用しない）。

#### Scenario: description に fixableCount が現れない

**Given** CODE_REVIEW_REPORT_TOOL.description
**When** その文字列を検査する
**Then** `fixableCount` の語が含まれない（`findings` 提出指示と `approved` の compat 注記は残る）

#### Scenario: fixableCount を含む入力は parse で受理されるが routing に影響しない

**Given** `{ ok: true, fixableCount: 3, findings: [] }` を `parseCodeReviewReportInput` に渡す
**When** parse する
**Then** `ok: true` で `value.fixableCount === 3` がセットされる（compat の受け口は維持される）

### Requirement: approved 経由で code-fixer に入ると low/medium fixable findings が prompt に渡る

code-review approved + fixable findings ありで code-fixer に入った場合、code-fixer の `buildMessage`
が生成する prompt 本文に、直前 code-review run の low/medium fixable findings が埋め込まれる SHALL。
fixer は findings ファイルの読み込みに依存してはならない MUST NOT。

#### Scenario: low/medium fixable findings が code-fixer prompt に埋め込まれる

**Given** 直前 code-review run の toolResult が low/medium の `resolution: "fixable"` findings を持ち、code-fixer の前回 run が存在しない（初回）
**When** code-fixer の `buildMessage` が呼ばれる
**Then** prompt 本文に当該 findings の title / file / rationale が現れ、review-feedback ファイルパスの読み込み指示に依存しない
