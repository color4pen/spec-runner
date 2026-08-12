# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. コードアサーション照合（request.md / design.md の断定を実コードと突き合わせ）

**`src/core/command/request.ts:126` — `executeValidate` の開始行**
- 実コード確認: 行 126 に `export async function executeValidate(filePath: string, opts?: ValidateOpts): Promise<number> {` が存在する ✓
- 現状 `executeValidate` は parse（`parseRequestMdContent`）と design-layer gate のみで規模検査を持たないことを確認 ✓

**`src/parser/extract-section.ts:82` — `受け入れ基準` が既存 parser にある**
- 行 80–84 に `REQUEST_CONSTRAINT_HEADINGS = ["スコープ外", "受け入れ基準", "architect 評価済みの設計判断"]` が存在する ✓
- 行 82 は正確に `"受け入れ基準",` ✓
- `extractMarkdownSections(content, headings)` が `##` 見出し単位で節本文を抽出する純関数であることを確認 ✓

**`src/prompts/request-review-system.ts:54` — Method 5（Scope & Complexity Evaluation）**
- 行 54 に `5. **Scope & Complexity Evaluation**: YAGNI 違反・スコープクリープ・隠れたコスト・未記載の設計判断を確認する。` が存在する ✓
- 分割可能性（縫い目）の観点が現時点で存在しないことを確認 ✓

**`src/core/step/request-review.ts` — 前周 findings / operator 裁定の周回注入を持たない**
- `buildMessage` は `buildRequestReviewInitialMessage` を呼ぶのみで、前回 findings やoperator 裁定の注入機構を持たないことを確認 ✓
- `nextIteration` で iteration 番号を更新し、新しい result ファイルパスに書き出す構造を確認（resume で新 iteration に再実行される事実と整合） ✓

**`docs/request-authoring.md:60` — 粒度節に質的分割基準 3 つ**
- 行 60 は `## 粒度 — 1 request は 1 つの収束ループ` ✓
- 分割判定基準 3 つ（独立して設計・テストできる / 収束の意味論が異なる / 受け入れ基準の相互参照）が行 70–73 に存在する ✓
- 量的目安が現時点で存在しないことを確認（追記対象として要件と整合） ✓

### 2. `logWarn` の挙動検証

`src/logger/stdout.ts` 確認:
- `logWarn` は `if (!isLevelEnabled("default")) return;` → `process.stderr.write("Warning: " + ...)` ✓
- `--quiet` フラグで level が "quiet"（order 0）になると `isLevelEnabled("default")`（order 1）が false になり抑制される ✓
- 設計の記述「`Warning: ` 接頭辞、default level で出力、`--quiet` で抑制」と完全一致 ✓

### 3. TC-REQ-004 との互換性確認

`buildValidRequestMd()` は受け入れ基準を 1 項目のみ生成する。閾値 15 より小さいため、警告は発生しない。`TC-REQ-004` の "does not write to stderr for valid file" アサーションは引き続き成立する ✓

`beforeEach` が `process.stderr.write` を spy するスコープを確認。TC-REQ-004 は上位の `beforeEach/afterEach` を引き継ぎ、`logWarn` も `process.stderr.write` を使うため、警告が出た場合は確実にキャッチされる構造 ✓

### 4. `parseRequestMdRaw` の不活性検証（D6）

`parseRequestMdRaw` が抽出するフィールドは `type`, `slug`, `baseBranch`, `adr`, `issue`, `pipeline` と sections（`背景`, `目的`）のみ。`## 分割検討済み` 節はこれらのいずれにも一致しないため、parse に影響しない ✓

`extractMarkdownSections` はリクエストした heading 名に一致する場合のみ節を抽出する設計。`buildRequestConstraintsBlock` は `["スコープ外", "受け入れ基準", "architect 評価済みの設計判断"]` のみを要求するため、`## 分割検討済み` 節は取り込まれない ✓

### 5. `DECISION_NEEDED_DEFINITION` の制約確認

`src/prompts/judge-rules.ts` 確認: `decision-needed` は `options` に 2 件以上の `{ label, consequence }` 形式の選択肢が必須。設計 D4「`options` に土台→上物の分割案を 2 件以上」と整合 ✓

### 6. spec.md の形式適合確認（rules.md の spec 記法）

- 全 Requirement に `### Requirement:` header ✓
- 全 Requirement に `#### Scenario:` ≥ 1 ✓
- 全 Requirement body に `SHALL` または `MUST` ✓
- Layer-1 振る舞いを記述（型・FSM の強制する Layer-0 は含まない） ✓

### 7. request → spec のカバレッジ確認

| request 要件 | spec Requirement | 対応 |
|---|---|---|
| 1. validate 規模警告（非ブロッキング） | Req 1: validate は過大な受け入れ基準に非ブロッキング警告 | ✓ Scenario 2 本 |
| 2. request-review の縫い目判定観点 | Req 2: request-review は縫い目判定観点を持つ | ✓ Scenario 1 本 |
| 3. 分割検討済み宣言の尊重 | Req 3: 分割検討済み宣言は縫い目 finding を抑制する | ✓ Scenario 1 本 |
| 4. docs/request-authoring.md 追記 | Req 4: authoring guidance が崖の実測と宣言規約を記載 | ✓ Scenario 2 本 |
| 5. request template のコツ更新 | Req 4 Scenario 2: template が規模目安と宣言への言及を含む | ✓ |

### 8. tasks.md → spec のテスト基準との整合確認

- T-02 の受け入れ基準「15 項目 → stderr 警告・exit 0」が spec Req 1 Scenario 1 と一致 ✓
- T-02 の受け入れ基準「14 項目以下 → 無警告」が spec Req 1 Scenario 2 と一致 ✓
- T-03 の受け入れ基準「prompt に縫い目 3 基準・実測値 8%/23%/15 が含まれる」が spec Req 2 Scenario と一致 ✓
- T-03 の受け入れ基準「宣言尊重ルールが prompt に含まれる」が spec Req 3 Scenario と一致 ✓
- T-05 の「checkbox 数不変」が spec Req 4 Scenario 2 と一致 ✓

### 9. セキュリティレビュー

- `countTopLevelAcceptanceCriteria` は純関数（I/O なし・exec なし）。ユーザー入力（request.md 本文）をカウントだけに用い、出力は整数 ✓
- `logWarn` の警告文はコードに静的埋め込み。カウント値（整数）のみを含む場合も injectionリスクなし ✓
- request-review prompt への追加は静的テキスト。動的コンテンツなし ✓
- OWASP Top 10 観点: 入力 validation、認証、認可、注入に関連する新しい信頼境界なし ✓

## 検証できなかった項目

None — 全確認対象を実コードで突き合わせた。

## Findings 詳細

### F-01 [Low / Observation]: `countTopLevelAcceptanceCriteria` がコードブロック内リスト項目を誤カウントする可能性

**対象**: design.md D3 / tasks.md T-01

受け入れ基準節のコードブロック（` ``` ` フェンス）内に `-` で始まる行がある場合、top-level 項目として誤ってカウントされる可能性がある。設計の Risks セクション「カウント方式の取りこぼし」に明示されており、「warning なので実害が小さい」と評価されている。

この trade-off は設計で意識的に選択されており、finding ではなく observation として記録する。warning-only のため、countが 1–2 ずれても動作上の副作用はない。

**Action**: 不要。設計の Risks に記載済みの known limitation。

---

Findings: なし（blocking / fixable / decision-needed ともに検出なし）
