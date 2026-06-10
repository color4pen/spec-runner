# Tasks: README を公開向けに拡充する

> 実装方針: すべて `README.md` への **追記のみ**（既存節の本文は 1 行も変更しない）。
> 挿入アンカーは design.md D1 の表に従う。step 名は `STEP_NAMES` の値を verbatim で使う。

## T-01: 安定性宣言（Stability）節を冒頭に追記する

- [x] intro 行 `A self-hosted CLI that drives multi-step development pipelines using Anthropic Claude.` の直後、`## Installation` の前に `## Stability`（見出し文言は実装者裁量だが「stability/status」が分かる英語）節を挿入する
- [x] 次を英語で明記する: SpecRunner は **0.x** であり、`0.x` の間は state / config フォーマットに破壊的変更があり得ること
- [x] migration は提供されるが **semver minor** で入る（major を待たない）ことを明記する
- [x] 既存 intro 行・`## Installation` 行に差分を出さない（前後に空行を挟んで挿入する）

**Acceptance Criteria**:
- `## Installation` より前に安定性宣言の節が存在する
- 「0.x」「breaking changes to state / config format」「migrations ship in a minor release」相当の記述がある
- 既存の intro 行と Installation 節は変更前と同一

## T-02: pipeline 概要（How the Pipeline Works）節を冒頭に追記する

- [x] T-01 の Stability 節の直後・`## Installation` の前に `## How the Pipeline Works`（文言は実装者裁量）節を挿入する
- [x] happy-path を番号付きリストで描く。step 名は `STEP_NAMES` の値を **verbatim** で使う:
  `request-review → design → spec-review → test-case-gen → implementer → verification → code-review → conformance → adr-gen → pr-create`
- [x] judge⇄fixer ループを注記する: `spec-review`⇄`spec-fixer` / `verification`⇄`build-fixer` / `code-review`⇄`code-fixer`、
  および `conformance` の `needs-fix` は `implementer` に戻ること（`STANDARD_TRANSITIONS` と一致させる）
- [x] 各 judge step で `needs-fix` ループが回ることを説明する
- [x] **escalation は失敗ではなく「人間の判断待ち」の正常な停止**であり、job state は保持され `specrunner job resume <slug>` で再開することを説明する
- [x] `request-review` の `needs-discussion` / `reject` が escalation であること、`adr-gen` は `request.adr === true` のときのみ ADR を生成することに触れる
- [x] 体裁は既存 README に合わせる（英語・`##`/`###` 見出し・` ```bash ` コードブロック）

**Acceptance Criteria**:
- pipeline 節の step 名がすべて `src/kernel/step-names.ts` の `STEP_NAMES` の値と一致する（誤記なし）
- judge⇄fixer ループと `conformance → implementer` 戻しの記述が `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` と矛盾しない
- escalation が「失敗ではなく人間判断待ちの正常停止」であり `job resume` で再開する旨が書かれている
- `## Installation` 節より前に配置されている

## T-03: コスト目安（Cost）節を Runtime Modes と Troubleshooting の間に追記する

- [x] 使い捨ての集計スクリプト（**commit しない**。`/tmp` 等で実行）を書き、`specrunner/changes/archive/*/usage.json` を集計する:
  - 各 `usage.json` の `commandInvocations[].modelUsage[<model>]` の 4 token クラス（`inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens`）を **request 単位で合算**して総 token を求める
  - USD は **各 invocation の実 model の list 価格**で算出する（model ごとに input / output / cache-write=1.25×input / cache-read=0.1×input の per-MTok 単価。`[1m]` suffix model は 1M-context tier 単価）
  - request 単位の総 token / USD を昇順ソートし、**最小 / 中央値 / 最大**を抽出する
- [x] `## Runtime Modes` ブロック末尾と `## Troubleshooting` の間に `## Cost`（文言は実装者裁量）節を挿入する
- [x] 典型的な request 1 件あたりの token 使用量レンジ（最小〜中央値〜最大）と USD 換算レンジを記載する
- [x] **算出方法を節内に一文で示す**（例: archived `usage.json` を集計し、各 invocation を実 model の Anthropic list 価格 as-of `<DATE>` で課金して合算した旨）。price の as-of 日付を明記する
- [x] **使用モデルは config で変更可能**であること、**レンジは request の複雑さに依存**することを併記する
- [x] 高い側のレンジが retry ループに嵌った request を含む点を一言添える（参考実測: 最小 ≈ 0.6M / 中央値 ≈ 6M / 最大 ≈ 117M token。cache read が ≈94% を占めるため cache 割引を必ず適用する）

**Acceptance Criteria**:
- token / USD のレンジが `usage.json` の実測集計に基づく（恣意的な丸め値でない）
- 算出方法（集計対象・price の as-of 日付・per-invocation 実 model 課金）が節内に明記されている
- 「model は config で変更可能」「レンジは複雑さ依存」の注記がある
- 集計スクリプトはリポジトリに commit されていない
- `## Runtime Modes` と `## Troubleshooting` の間に配置されている

## T-04: 前提と対応範囲（Assumptions & Supported Scope）節を追記する

- [x] T-03 の Cost 節の直後・`## Troubleshooting` の前に `## Assumptions & Supported Scope`（文言は実装者裁量）節を挿入する
- [x] **信頼モデル**: `request.md` は信頼された入力であり、request を書いた本人が PR を承認する solo 運用が前提。第三者の `request.md` をそのまま流す運用は想定外であることを明記する
- [x] **検証ゲートの対象範囲**: デフォルト（`verification.commands` 未設定）では package.json の `build / typecheck / test / lint` script 検出に基づくため主対象は Node / Bun であること、script を検出できず `verification.commands` も未設定なら検証ゲートが no-op になり品質保証がレビュー agent の判断に依存することを明記する
- [x] **escape hatch**: ただし `verification.commands` を設定すれば任意言語（Python / Go / Rust 等）で検証コマンドを実行できることを併記する（既存 Troubleshooting 節・実装と矛盾させない）
- [x] **コミット履歴の信頼**: 外部コントリビュータのいるリポジトリでは git log / diff が agent prompt に入るため、信頼できないコミット履歴を持つリポジトリでの実行は非推奨であることを注意書きする
- [x] 英語・既存体裁に合わせる

**Acceptance Criteria**:
- 信頼モデル（solo 運用前提・第三者 request 想定外）の記述がある
- 検証ゲートが default で Node/Bun 主対象である旨と、`verification.commands` で任意言語対応できる escape hatch の両方が書かれている
- 信頼できないコミット履歴のリポジトリでの実行が非推奨である注意書きがある
- `## Troubleshooting` 節より前に配置されている

## T-05: README↔step 名のドリフトガードテストを追加する

- [x] `tests/` 配下（既存構成に倣い `tests/unit/docs/readme-pipeline-sync.test.ts` 等）に unit test を 1 ファイル追加する
- [x] `README.md` を読み、`Object.values(STEP_NAMES)`（`src/kernel/step-names.ts` から import）の全値が README 本文に出現することを assert する
- [x] 4 つの新節見出し（Stability / How the Pipeline Works / Cost / Assumptions & Supported Scope に対応する見出し文字列）が README に存在することを assert する
- [x] テストが repo root からの相対で README を解決し、環境非依存で動くこと

**Acceptance Criteria**:
- `STEP_NAMES` の値を 1 つでも README から削ると当該テストが落ちる
- 4 見出しのいずれかを欠くとテストが落ちる
- `bun run test` で当該テストが green

## T-06: 追記の不変性と品質ゲートを確認する

- [x] `git diff README.md` を確認し、差分が **新節の挿入のみ**で既存節の本文行に変更がないことを確認する（受け入れ基準「既存節に差分がない」）
- [x] 追記中に既存節と実装/新節の矛盾を発見した場合は、既存節を修正せず escalation で報告する（D6）
- [x] `bun run typecheck` が green
- [x] `bun run test` が green

**Acceptance Criteria**:
- README の既存節（Installation / Quick Start / Environment Variables / Command Reference / Configuration / Runtime Modes / Troubleshooting）に差分がない
- `bun run typecheck && bun run test` が green
- 矛盾を発見した場合に escalation で報告されている（該当時）
