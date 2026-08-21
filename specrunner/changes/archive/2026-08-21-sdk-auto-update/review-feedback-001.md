# Code Review Feedback — sdk-auto-update — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `.github/dependabot.yml` の内容を全行読み、各フィールドと YAML コメントを確認した
- `tests/dependabot-config.test.ts` を全行読み、5 件の `it` と import 構成を確認した
- `specrunner/changes/sdk-auto-update/verification-result.md` でビルド・型チェック・テスト・lint の全フェーズ結果と dependabot-config.test.ts の通過を確認した
- `tests/grep-workflow-actions-pinned.test.ts` を読み、既存テストパターンとの一貫性を確認した
- `vitest.config.ts` を読み、`process.cwd()` ベースのパス解決が正しく機能する前提を確認した
- `specrunner/changes/sdk-auto-update/design.md` の設計判断（D1〜D5）を読み、実装との対応を確認した
- `specrunner/changes/sdk-auto-update/tasks.md` の全チェックボックスが完了済みであることを確認した
- `specrunner/changes/sdk-auto-update/spec-review-result-001.md` を読み、前段レビューの観察事項を確認した

## 検査対象ファイル

| ファイル | 変更種別 |
|----------|---------|
| `.github/dependabot.yml` | ADDED |
| `tests/dependabot-config.test.ts` | ADDED |

---

## 受け入れ基準の検証

### AC1: `.github/dependabot.yml` が追加され、設定が正しい

- ✅ ファイルが存在する（`.github/` 配下の確認済み）
- ✅ `version: 2`
- ✅ `package-ecosystem: "bun"`
- ✅ `directory: "/"`
- ✅ `schedule.interval: "weekly"`
- ✅ `allow` エントリが `dependency-name: "@anthropic-ai/claude-agent-sdk"` 1 件のみ

### AC2: auto-merge に相当する指定が含まれないことをテストで固定

- ✅ `tests/dependabot-config.test.ts` の 5 件目 `"auto-merge キーが存在しない"` が明示的に `expect(content).not.toContain("auto-merge:")` でアサート
- ✅ `dependabot.yml` 内コメント `# auto-merge は設定しない。` は `auto-merge:` (コロン付き) を含まないため誤検知なし

### AC3: 導入 PR 説明に初回大型更新の運用注記が含まれる

- ✅ `dependabot.yml` の YAML コメント（8〜16 行目）に以下を明記:
  - `^0.2.128` → upstream 0.3.x への初回 PR は 0.x minor 境界を越える大型更新になる旨
  - merge 前に pipeline の実地動作を確認すること
  - auto-merge は設定しない旨と unit CI では検知できない層に影響した実績
- ✅ PR body は `body-template.ts` が `request.md` の 背景セクションを自動レンダリングするため、PR 説明にも同内容が含まれる（設計 D4 確認済み）

### AC4: `typecheck && test` が green

- ✅ `verification-result.md` でビルド・型チェック・テスト・lint のすべてが passed
- ✅ `tests/dependabot-config.test.ts` 5 件すべてが green（verification ログ L931 確認）
- ✅ テスト全体 809 ファイル / 12107 件 passed（1 skipped / 2 todo のみ）

---

## コード品質の評価

### `.github/dependabot.yml`

- **設計の妥当性**: `allow` フィルタで対象を 1 パッケージに限定する方式は `ignore` リストより堅牢（将来の依存追加時にメンテナンス不要）。設計 D2 の判断は正しい。
- **簡潔性**: 設定は最小限。不要なフィールド（`assignees`、`reviewers`、`labels`、`commit-message` 等）を含まない。
- **コメント**: 運用上の注意事項（初回大型更新・人間 merge・auto-merge 非設定の理由）が網羅されており、設定ファイルを参照する運用者が文脈を把握できる。

### `tests/dependabot-config.test.ts`

- **パターン一貫性**: 既存 `tests/grep-workflow-actions-pinned.test.ts` と同一の `node:fs/promises` + 文字列マッチングパターンを踏襲。外部 YAML パーサーを追加しない判断（設計 D3）は合理的。
- **import 制限**: `vitest`・`node:fs/promises`・`node:path` のみ。外部依存追加なし。
- **パス解決**: `path.resolve(process.cwd(), ".github/dependabot.yml")` は vitest が project root で動作する前提で正しい。`vitest.config.ts` で同パターンが使われていることを確認済み。
- **カバレッジ**: 5 件すべてが tasks.md T-02 の仕様に対応している。

---

## 検証できなかった項目

- Dependabot が実際に PR を生成する動作（GitHub 上でのランタイム挙動は実行時のみ確認可能）。設計は公式 docs の確認済みサポートに依拠しており、レビュー上の懸念事項ではない。

---

## Findings 詳細

なし。

---

## 観察事項（findings に至らない事項）

**[観察 1]** スケジュール interval の弱い文字列マッチ

`"スケジュールが weekly である"` テストは `.toContain("weekly")` を使用する。`interval: "weekly"` / `interval: weekly` の両形式に対応するという tasks.md の設計意図は正しいが、コメント中に "weekly" が含まれていても pass してしまう。ただし、現在のファイルはコメントに "weekly" を含まないため誤検知は発生しない。意図した設計判断であり、修正は不要。

**[観察 2]** YAML コメントの運用注記はテスト対象外

初回大型更新コメント（T-01 の AC）はテストで直接検証されていない。PR body の AC は body-template.ts + request.md 経由で充足される（設計 D4）。コメントはリグレッション保護の対象外だが、設定ファイルの可読性・運用者向け文書化の目的は果たしており、問題なし。

**[観察 3]** `fs.stat` による存在確認のエラー出力形式

`fs.stat` でファイル不在時は `ENOENT` 例外スローとなり、vitest の出力が stack trace になる。expect assertion と異なるが、テストの pass/fail 判定は正しく機能する。既存パターンとも一致しており、問題なし。
