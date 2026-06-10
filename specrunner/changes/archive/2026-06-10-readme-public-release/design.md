# Design: README を公開向けに拡充する

## Context

`README.md`（現状 206 行）は Installation / Quick Start / Failure-resume / Command Reference /
Configuration / Runtime Modes / Troubleshooting を備え、運用ドキュメントとしては機能している。
しかし作者以外が初見で読む前提の情報が欠けている:

- pipeline が request.md → PR をどう進めるか（step の流れ・judge ループ・escalation の意味）
- 1 request あたりのコスト目安
- 信頼モデル（誰の request を信頼するか）と対応プロジェクト範囲
- 0.x の安定性宣言

本変更は npm 公開に先立ち、これら 4 節を **追記のみ** で README に加える。既存節は一切変更しない。

### 確定した実装事実（追記内容の根拠）

- **pipeline step / 遷移の single source of truth**:
  - step 名: `src/kernel/step-names.ts`（`STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES`）。
    `src/core/step/step-names.ts` は kernel を re-export する薄いラッパ。
  - 遷移: `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS`、構成は `src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR`。
  - 標準パイプラインの step 順（`STANDARD_DESCRIPTOR.steps` / `startStep = request-review`）:
    `request-review → design → spec-review → spec-fixer → test-case-gen → implementer →
     verification → build-fixer → code-review → code-fixer → conformance → adr-gen → pr-create`
  - judge ループ（`loopFixerPairs`）: `spec-review⇄spec-fixer` / `verification⇄build-fixer` / `code-review⇄code-fixer`。
    `conformance` の `needs-fix` は `implementer` に戻る（fixer ペアではなくフェーズ戻し）。
  - escalation 経路（`STANDARD_TRANSITIONS` の `to: "escalate"`）:
    request-review の `needs-discussion` / `reject` / `error`、各 step の `error`、`verification` の `escalation` verdict、
    および `LOOP_ERROR_CODES`（spec-review / verification / code-review / conformance）のループ予算超過。
  - `adr-gen` は `request.adr === true` のときのみ ADR を生成する（`src/core/step/adr-gen.ts`、false なら no-op で通過）。
- **コスト実測データ**: `specrunner/changes/archive/*/usage.json` が 278 件存在する。
  schema は `commandInvocations[].modelUsage[<model>]` = `{ inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }`。
  予備集計（実装時に再計算する。本値は sanity-check 用の参考）:
  - request 1 件あたり総 token（4 クラス合算）: 最小 ≈ 0.6M / 中央値 ≈ 6.1M / 最大 ≈ 117M（最大は retry ループに嵌った外れ値）。
  - token クラス内訳（全 request 合算）: cacheRead ≈ 94% / cacheCreate ≈ 4.7% / output ≈ 1.0% / input ≈ 0.3%。
    → cache read が支配的なので、USD は raw token 数から素朴に見積もるより大幅に安い。
  - 実測 model: `claude-haiku-4-5` / `claude-sonnet-4-6` / `claude-opus-4-5` / `claude-opus-4-6[1m]` /
    `claude-opus-4-7[1m]` / `claude-opus-4-8[1m]`（`[1m]` は 1M context tier）。
- **verification の検証ゲート**: `src/core/verification/runner.ts` は 2 経路。
  (1) config の `verification.commands` 指定時は任意言語の command 列を実行（language-agnostic）。
  (2) 未指定時のみ package.json の `build / typecheck / test / lint / security` script を検出・実行し、
  script が見つからなければ `_(skipped — script not found in package.json)_` で no-op になる。
  → 「Node/Bun が主対象」は **(2) のデフォルト動作に限った話**であり、`verification.commands` を設定すれば任意言語で検証できる
  （request-review-result-001.md Finding #1 / 既存 Troubleshooting 節と整合させる）。
- **0.x 宣言の裏付け**: `package.json` version = `0.1.9`。config migration 機構が存在する
  （`src/config/migrate.ts` の `applyMigration` / `migrateConfig`、`specrunner init` の `.gitignore` 自動 migrate）。

## Goals / Non-Goals

**Goals**:

- README に 4 節を **追記のみ** で加える: (A) 安定性宣言、(B) pipeline 概要、(C) コスト目安、(D) 前提と対応範囲。
- 追記は既存 README の言語（英語）・見出しレベル（`##`）・コードブロック体裁に合わせる。
- pipeline 概要の step 名・遷移を実装（`step-names.ts` / `STANDARD_TRANSITIONS`）と一致させる。
- コスト数値を `usage.json` の実測集計に基づかせ、算出方法を節内に一言記す。
- 既存節をバイト単位で不変に保つ（挿入のみ。既存テキストの編集・再構成をしない）。
- README↔step 名のドリフトを防ぐ軽量テストを追加し、`typecheck && test` を green に保つ。

**Non-Goals**:

- npmjs.com への公開作業（registry 変更・publish 設定）。
- ドキュメントサイトの構築。
- `architecture/` 配下のドキュメント変更。
- README 既存節のリライト・再構成。
- README の `docs/*.md` 分割（architect 評価: 400 行超で検討。現状 206 行 + 追記 ≈ 350 行前後の想定で閾値未満）。

## Decisions

### D1: 4 節をすべて「既存節の隙間への挿入」として追記する

既存節を一切編集せず、節と節の境界に新節を挿入する。挿入アンカー（既存の一意な行）:

| 節 | 位置 | アンカー（直前 → 直後） |
|----|------|----------------------|
| (A) Stability | 冒頭・intro 直下 | intro 行 `A self-hosted CLI ...` → `## Installation` |
| (B) How the Pipeline Works | (A) の直後・Installation の前 | (A) → `## Installation` |
| (C) Cost | Runtime Modes と Troubleshooting の間 | `## Runtime Modes` ブロック末尾 → `## Troubleshooting` |
| (D) Assumptions & Supported Scope | (C) の直後・Troubleshooting の前 | (C) → `## Troubleshooting` |

冒頭側に (A)(B)、末尾側に (C)(D) を置く。順序は intro → Stability → How the Pipeline Works → Installation、
… → Runtime Modes → Cost → Assumptions & Supported Scope → Troubleshooting。

**Rationale**: 受け入れ基準「既存節に差分がない（追記のみ）」を構造的に保証する最も確実な方法は、
既存行に触れず境界へ挿入すること。intro 直下に安定性宣言、その下に pipeline 概要を置くことで、
新規読者が「これは何で、どう動き、まだ 0.x である」を最初に把握できる。コスト/前提は読了後半の判断材料なので末尾側に置く。
**Alternatives considered**: 既存 Troubleshooting や Quick Start 内に小見出しで混ぜ込む案 — 既存節の本文に差分が出るため却下。

### D2: pipeline 概要は STANDARD_DESCRIPTOR の step 順をそのまま happy-path として描き、judge ループと escalation を別建てで説明する

step 名は `STEP_NAMES` の値（`request-review` / `design` / `spec-review` / `spec-fixer` / `test-case-gen` /
`implementer` / `verification` / `build-fixer` / `code-review` / `code-fixer` / `conformance` / `adr-gen` / `pr-create`）を
**verbatim** で使う。happy-path を番号付きリストで示し、`⇄` で judge⇄fixer ループを注記する。
別小節「Judge loops and escalation」で次を説明する:

- reviewer step（`spec-review` / `code-review`）は `needs-fix` で paired fixer に回り `approved` まで反復する。
- `verification` は `failed` で `build-fixer` に回り `passed` まで反復する。
- `conformance` の `needs-fix` は `implementer` に戻る（impl フェーズ再入）。
- `request-review` は front gate で、`needs-discussion` / `reject` は **escalation**（ループしない）。
- **escalation は失敗ではなく、agent が単独で下すべきでない判断（曖昧な request・未解決の指摘・直せない build）を
  人間に戻す正常な停止**である。job state は保持され、`specrunner job resume <slug>` で再開する。
- `adr-gen` は `request.adr === true` のときのみ ADR を生成する。

**Rationale**: 受け入れ基準「step 名・遷移が実装と一致」を満たすには canonical 名を verbatim で使うのが必須。
happy-path + ループ注記 + escalation 概念の 3 層構成にすると、全 escalate edge を列挙せずとも読者は停止の意味と再開手段を理解できる。
**Alternatives considered**: 全 `STANDARD_TRANSITIONS` 行を表で転記する案 — 冗長で README 向きでなく、`when` 述語付き行（code-review approved+fixableCount）の説明が過剰になるため却下。

### D3: README↔step 名のドリフトを防ぐ軽量テストを追加する

`tests/` に README の pipeline 節と `STEP_NAMES` の整合を検証する unit test を 1 ファイル追加する:

- `STEP_NAMES` の全値が README 本文に出現すること（canonical 名の取りこぼし・誤記検出）。
- 4 つの新節見出しが README に存在すること（追記の完了検証）。

**Rationale**: 受け入れ基準「step 名・遷移が実装と一致している」は、人手レビューだけだと将来の step 追加/改名で容易に腐る。
本リポジトリは step 名に compile-time guard（`state/schema.ts` の双方向ガード）や snapshot test を敷く文化があり、
ドキュメントにも同種の drift guard を置くのが一貫する。テスト 1 件で「一致」を機械的・継続的に保証できる。
**Alternatives considered**: テストを追加せず code-review の目視に委ねる案 — 一致が将来腐るリスクを残すため却下。
README 全文を snapshot する案 — 文言調整のたびに更新が要りノイズが大きいため、step 名集合の包含チェックに限定。

### D4: コストは「アーカイブ実績の実支出」を per-invocation 価格で集計して提示する

実装時に使い捨て集計スクリプト（commit しない）で次を算出する:

1. `specrunner/changes/archive/*/usage.json` を走査し、`commandInvocations[].modelUsage` の各 model の
   4 token クラス（input / output / cacheRead / cacheCreation）を request 単位で合算 → 総 token。
2. USD は **各 invocation の実 model の list 価格**で算出する（model ごとに input / output /
   cache-write = 1.25×input / cache-read = 0.1×input の per-MTok 単価を適用）。
   `[1m]` suffix model は 1M-context tier 単価を適用する。価格の as-of 日付を README に明記する。
3. request 単位の総 token と USD を昇順ソートし、最小 / 中央値 / 最大を抽出してレンジで提示する。
4. 「使用モデルは config で変更可能」「レンジは request の複雑さに依存」を併記する。

README には数値レンジ + **算出方法の一文**（例: "Figures aggregate this project's own archived runs
(`specrunner/changes/archive/*/usage.json`), summing input/output/cache token classes per request and pricing each
invocation at its model's Anthropic list rate as of <DATE>."）を載せる。

**Rationale**: アーカイブには複数 model（haiku/sonnet/opus[1m]）混在の実 token が記録済みなので、
「各 invocation を実 model 単価で課金して合算」が最も忠実で再現可能。これにより「どの model を仮定するか」を恣意的に決めずに済み、
model 変更で将来コストが動くことは「config で変更可能」の注記で説明できる。cache read が 94% を占めるため、
cache 割引（0.1×）を正しく適用しないと過大見積もりになる点が重要。
**Alternatives considered**:
- 単一 model（sonnet）単価で全 token を課金する案 — 実績と乖離し、混在運用の実コストを反映しない。
- raw token 数だけ載せ USD を出さない案 — 要件 2「USD 換算レンジ」を満たさない。

### D5: 前提と対応範囲は verification の escape hatch を明示し、既存記述と矛盾させない

(D) Assumptions & Supported Scope 節で 3 点を書く:

1. **信頼モデル**: `request.md` は信頼された入力。request を書いた本人が PR を承認する solo 運用が前提。
   第三者の `request.md` をそのまま流す運用は想定外。
2. **検証ゲートの対象範囲**: デフォルト（`verification.commands` 未設定）では package.json の
   `build / typecheck / test / lint` script 検出に基づくため主対象は Node / Bun。
   script を検出できず `verification.commands` も未設定の場合は検証ゲートが no-op になり、品質保証がレビュー agent の判断に依存する。
   **ただし `verification.commands` を設定すれば任意言語（Python / Go / Rust 等）で検証コマンドを実行できる**ことを併記する。
3. **コミット履歴の信頼**: 外部コントリビュータのいるリポジトリでは git log / diff が agent prompt に入るため、
   信頼できないコミット履歴を持つリポジトリでの実行は非推奨。

**Rationale**: request-review-result-001.md Finding #1 のとおり、(2) を escape hatch 抜きで書くと
「非 Node/Bun では使えない」という誤解を生む。既存 Troubleshooting 節は既に `verification.commands` に言及しており、
新節がそれと矛盾しないよう default 動作に限定した注記にする。
**Alternatives considered**: escape hatch に触れず Node/Bun 限定と書く案 — 既存節・実装と矛盾し誤情報になるため却下。

### D6: 既存内容との矛盾は修正せず escalation で報告する

追記中に既存節の記述と実装/新節が矛盾する箇所を発見しても、既存節は修正しない（要件 6）。
矛盾は実装を止めて escalation（人間判断待ち）として報告する。

**Rationale**: 本変更のスコープは「追記のみ」。既存節のリライトはスコープ外であり、矛盾解消の是非は人間が判断すべき。
**Alternatives considered**: 矛盾を黙って修正する案 — スコープ外編集になり「既存節に差分なし」を破るため却下。

## Risks / Trade-offs

- [Risk] 挿入時に既存節の行へ意図せず差分が混入し「追記のみ」を破る
  → Mitigation: D1 のアンカー（既存の一意行）境界に挿入。実装後に `git diff` で既存節に変更がないことを確認する。
- [Risk] コスト USD が hypothetical model（4.x 世代）の価格不確実性で恣意的になる
  → Mitigation: 実 model の list 価格を as-of 日付付きで明記し、算出方法を README に一文で示す（再現可能・検証可能にする）。
- [Risk] README↔step 名テストが文言調整のたびに脆く落ちる
  → Mitigation: 全文 snapshot ではなく「`STEP_NAMES` 値の包含」+「4 見出しの存在」に限定。step 追加/改名という意味のある変化でのみ落ちる。
- [Risk] コスト最大値（≈117M token）が外れ値で読者に過大な印象を与える
  → Mitigation: レンジ提示時に高い側が retry ループに嵌った request を含む旨を一言添える（実装者判断）。
- [Risk] 追記で README が肥大化し可読性が落ちる
  → Mitigation: 各節は簡潔に。400 行超で `docs/*.md` 分割（architect 評価の閾値）。現状想定は閾値未満。

## Open Questions

- コスト USD の price table の as-of 日付と単価ソース（公式 pricing ページ）は実装時点で最新のものを採用する。
  `[1m]` tier の long-context 割増単価が公開情報で取得できない model がある場合、その model を含む invocation の扱い
  （直近世代の同等単価で近似するか、注記するか）は実装時に判断する。
