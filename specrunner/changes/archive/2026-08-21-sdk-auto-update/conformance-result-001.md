# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Normative 判定根拠

- **request.md**: 要件 1–4 / 受け入れ基準 (AC-1〜AC-4) を normative として確認
- **spec.md**: SPEC-EXEMPT（chore type）— Requirements / Scenarios なし。振る舞い spec の適用対象外であることを確認
- **design.md**: D1–D5 を plan context として読解。D4 が AC-3 と矛盾する可能性を特定
- **tasks.md**: T-01 / T-02 チェックボックスすべて完了済みであることを確認（plan context）

### 実装ファイル確認

#### `.github/dependabot.yml`（ADDED）

ファイル全文を確認した。

| 要素 | 期待値 | 実際値 | 判定 |
|------|--------|--------|------|
| `version` | `2` | `2` | ✅ |
| `package-ecosystem` | `"bun"` | `"bun"` | ✅ |
| `directory` | `"/"` | `"/"` | ✅ |
| `schedule.interval` | `"weekly"` | `"weekly"` | ✅ |
| `allow[0].dependency-name` | `"@anthropic-ai/claude-agent-sdk"` | `"@anthropic-ai/claude-agent-sdk"` | ✅ |
| allow エントリ数 | 1 のみ | 1 | ✅ |
| `auto-merge:` キー | 存在しない | 存在しない | ✅ |
| 初回大型更新 YAML コメント | 記載あり | `"merge 前に pipeline の実地動作まで確認すること"` として記載 | ✅（YAML 内） |

#### `tests/dependabot-config.test.ts`（ADDED）

全 41 行を確認した。

| it | アサーション内容 | 実行結果 |
|----|----------------|----------|
| `dependabot.yml が存在する` | `fs.stat().isFile() === true` | ✅ PASS |
| `package-ecosystem が bun に設定されている` | `toContain('package-ecosystem: "bun"')` | ✅ PASS |
| `スケジュールが weekly である` | `toContain("weekly")` | ✅ PASS |
| `allow に @anthropic-ai/claude-agent-sdk が含まれる` | `toContain('dependency-name: "@anthropic-ai/claude-agent-sdk"')` | ✅ PASS |
| `auto-merge キーが存在しない` | `not.toContain("auto-merge:")` | ✅ PASS |

外部依存ライブラリなし（`node:fs/promises`, `node:path`, `vitest` のみ）✅

#### PR body レンダリング経路

`src/core/pr-create/body-template.ts` を確認した。
- `renderPrBody()` は `parsedRequest.sections["背景"]` と `sections["目的"]` のみを Summary に含める
- `src/parser/request-md.ts` の `extractSections()` は `targetHeadings = ["背景", "目的"]` のみを抽出する

request.md のセクション構造:
- `## 背景`（L10）→ PR body に含まれる
- `## 現状コードの前提`（L16）→ PR body に含まれない
- `## 要件`（L24）→ PR body に含まれない

`## 背景` の内容（PR body に含まれる）:
> "merge は自動化しない。SDK 更新は CI（unit test）で見えない層 … 人間 merge の担保は「auto-merge を設定しない」ことによる"

**確認：** 背景セクションには「初回大型更新 → pipeline の実地動作確認 → 人間 merge」という運用指示は含まれない。この内容は `## 現状コードの前提`（"upstream は 0.3.x"）と `## 要件` 要件 4（"pipeline の実地動作まで確認してから merge する"）に分散しており、PR body レンダリング対象外。

YAML コメントには "merge 前に pipeline の実地動作まで確認すること" が記載されているが、YAML コメントは PR body ではない。

#### typecheck / test 実行確認

- `bun run typecheck`（`tsc --noEmit`）: exit 0（出力なし = 型エラーなし）✅
- `bun run test`: 809 test files passed / 12107 tests passed ✅
- `verification-result.md`: build / typecheck / test / lint すべて passed ✅

---

## 受け入れ基準ごとの判定

| # | 受け入れ基準 | 判定 |
|---|------------|------|
| AC-1 | `.github/dependabot.yml` 追加 + `bun`/weekly/allow 限定をテストで固定 | ✅ PASS |
| AC-2 | auto-merge 不在をテストで固定 | ✅ PASS |
| AC-3 | 導入 PR 説明に初回大型更新の運用注記（実地確認後の人間 merge）を含む | ❌ FAIL |
| AC-4 | `typecheck && test` が green | ✅ PASS |

---

## 検証できなかった項目

None — 実装ファイルはすべて確認可能な範囲に存在し、テストも実行確認済み。

---

## Findings 詳細

### F-1: AC-3 — PR body に初回大型更新の運用注記が含まれない（medium）

**要件の根拠**:
- request.md `## 要件` 要件 4: 「人間が pipeline の実地動作まで確認してから merge する前提を**導入 PR の説明（PR body）に明記する**」
- request.md `## 受け入れ基準`: 「導入 PR の**説明**に初回大型更新の運用注記（実地確認後の人間 merge）が含まれる」

**実装の状態**:
- YAML コメント（`.github/dependabot.yml` L8–L11）に "merge 前に pipeline の実地動作まで確認すること" を記載 ✅
- PR body（`body-template.ts` → request.md `## 背景` レンダリング）には一般的な human merge 根拠（"merge は自動化しない"）は含まれるが、初回大型更新に対する「実地確認後の人間 merge」の指示は含まれない ❌

**設計との関係**:
- D4 は "PR body テンプレートを変更して要件セクションを追加レンダリング — 却下" と明示して YAML コメント配置を選択した
- この設計判断は AC-3 の "PR の説明に明記する" と矛盾する

**修正方針（参考）**:
request.md の `## 背景` セクションに初回大型更新の実地確認指示を追記することが最小コスト。
`body-template.ts` は変更不要（`## 背景` を既にレンダリングしている）。
