# SpecRunner の README.md を新規作成（Status セクション含む）

## Meta

- **type**: documentation
- **slug**: readme-status-section
- **date**: 2026-04-30
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

SpecRunner repo には現在 README.md が存在しない（`git ls-tree origin/main -- README.md` で確認済み、空）。

self-host pipeline（propose → spec-review (loop) → implementer → verification (loop) → code-review (loop) → pr-create → end）が PR #40 で完成し、それ以降 PR #42, #44, #46 でパイプラインの完成度を高めてきた。この milestone を機に、最低限の README を新規作成して project 概要 + 進捗 Status を記録しておきたい。

これは self-host pipeline の dogfooding として、pipeline 全段が実機で動くことを E2E 検証する目的を兼ねる。

## 目的

repo root に `README.md` を **新規作成**し、以下 2 セクションを含める:

1. project 概要（短く）
2. Status セクション（self-host pipeline 完成記録）

## 要件

1. `README.md` を repo root に新規作成する。
2. 内容は次の 2 セクション構成とする:

   ```markdown
   # SpecRunner

   A self-hosted CLI that drives multi-step development pipelines using Anthropic Managed Agents.

   ## Status

   Self-host pipeline complete as of 2026-04-30 (PR #40 merged).
   ```

3. 既存の他のファイル（`src/`, `tests/`, `package.json` 等）には**一切変更を加えない**。本 request は新規 file 1 つの追加のみ。

## 受け入れ基準

- [ ] `README.md` が repo root に存在する
- [ ] `README.md` が `# SpecRunner` 見出しと project description を含む
- [ ] `README.md` が `## Status` セクションを含む
- [ ] Status セクションに `Self-host pipeline complete as of 2026-04-30` の記述がある
- [ ] `git diff` の変更は `README.md` の追加のみ（他ファイル変更ゼロ）
- [ ] `bun run typecheck` が PASS（README 追加なので既存の typecheck baseline は維持される）
- [ ] `bun run test` が PASS（README 追加なので既存テスト baseline は維持される）

## 振る舞い不変の確認方法

- 既存テスト全 PASS（regression 0、現状 533 tests）
- typecheck PASS（既存 errors があれば baseline として維持、本 request では悪化させない）

## 補足

- delta spec は不要（doc-only change、新規 capability ではない）
- 新機能の追加なし、コード変更なし
- 本 request の最大目的は **self-host pipeline の E2E 検証**であり、README の内容自体は副次的
- 過去の dogfooding 試行（dogfooding-001 〜 004）の経緯:
  - dogfooding-001/002: propose stub 問題で escalate → PR #42 で修正
  - dogfooding-003: workspace branch propagation 問題で escalate → PR #44 で修正
  - dogfooding-004: spec-review push 問題で escalate → PR #46 で修正、ただし request.md が「既存 README に append-only」と書いていたため feasibility blocker で再 escalate
  - 本（修正版）: request.md を「README 新規作成」に書き直して再投入
