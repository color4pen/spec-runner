# finish 時の delta spec → baseline merge を実装する

## Meta

- **slug**: implement-delta-merge
- **type**: new-feature
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator

## 背景

openspec CLI 依存を廃止した（PR #189-191）結果、finish 時の delta spec → baseline spec マージ機能が欠落した。現在の `archive-change-folder.ts` は change folder を `git mv` で archive に移動するだけで、delta spec（ADDED/MODIFIED/REMOVED）を baseline spec（`specrunner/specs/<capability>/spec.md`）に反映しない。

baseline spec は 49 本存在するが、pipeline のどのステップも消費しておらず、delta merge が動かない限り baseline は永久に更新されない。

旧 openspec CLI の `specs-apply.js` が担っていた以下の機能を SpecRunner 自前で実装する:

- delta spec のパース（`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`）
- baseline spec の `## Requirements` セクション内 `### Requirement:` ブロック単位の操作
- ADDED → 末尾追加、MODIFIED → 同名ブロック差し替え、REMOVED → 削除
- セクション内重複・クロスセクション競合のバリデーション

## 目的

finish 時に delta spec を baseline spec に自動マージし、baseline spec を「現在の振る舞いの正」として維持する。

## 要件

1. **delta spec パーサー** — `src/core/finish/spec-merge.ts` を新設。delta spec から `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` の 3 セクションをパースし、各セクション内の `### Requirement: <名前>` ブロックを抽出する。RENAMED は実績ゼロのため対象外。

2. **baseline spec パーサー** — baseline spec の `## Requirements` セクションを `### Requirement:` 単位でブロック分割する。セクション外（Purpose, 前文等）はそのまま保持する。

3. **マージロジック** — 以下の順序で適用する:
   - REMOVED: baseline から該当 Requirement ブロックを削除。存在しない場合はエラー
   - MODIFIED: baseline の同名 Requirement ブロックを delta の内容で丸ごと差し替え。存在しない場合はエラー
   - ADDED: baseline の Requirements セクション末尾に追加。既に同名が存在する場合はエラー

4. **バリデーション** — マージ前に以下を検証する:
   - セクション内の Requirement 名重複
   - クロスセクション競合（同一名が ADDED と MODIFIED の両方に存在する等）
   - バリデーションエラー時はマージを中止し escalation

5. **新規 capability 対応** — baseline spec が存在しない capability に対する ADDED のみの delta は、新規 spec ファイルを生成する。MODIFIED/REMOVED は新規 spec に対してはエラー。

6. **finish orchestrator への統合** — `src/core/finish/orchestrator.ts` の Phase 1 で、`archiveChangeFolder` 呼び出し前にマージを実行する。マージ → archive → move の順。change folder 内に `specs/` ディレクトリが存在しない場合はマージをスキップ（refactoring 等の spec 変更なし case）。

7. **paths.ts の拡張** — `specsDirRel()` と `baselineSpecPath(capability)` を追加する。

8. **DI パターン** — `archive-change-folder.ts` と同様の inject パターン（`SpawnFn`, `FinishFs`）でテスタビリティを確保する。

9. **テスト** — 以下のケースをカバーする:
   - ADDED: 新規 Requirement の追加
   - MODIFIED: 既存 Requirement の差し替え
   - REMOVED: 既存 Requirement の削除
   - 複合: 1 つの delta spec に ADDED + MODIFIED + REMOVED が混在
   - 新規 capability: baseline 未存在時の spec 生成
   - エラー: 重複名、存在しない Requirement への MODIFIED/REMOVED、クロスセクション競合
   - スキップ: change folder に specs/ がない場合

## 受け入れ基準

- [ ] `spec-merge.ts` が delta spec をパースし baseline にマージできる
- [ ] ADDED/MODIFIED/REMOVED の 3 操作が正しく動作する
- [ ] バリデーションエラー時にマージが中止される
- [ ] finish Phase 1 で archive 前にマージが実行される
- [ ] specs/ がない change folder ではマージがスキップされる
- [ ] 新規 capability に対する ADDED で spec ファイルが生成される
- [ ] `paths.ts` に `specsDirRel()` と `baselineSpecPath()` が追加されている
- [ ] `bun run typecheck` / `bun run lint` / `bun run test` が全 pass

## 補足

- baseline spec の内容品質（TBD Purpose、実装との乖離）の修正は scope 外。本 change はマージ機構の実装のみ
- baseline spec の消費パイプライン（propose/code-review への注入）は別 request
- RENAMED 操作は将来必要になった時点で別 request で追加
- 旧 openspec の `specs-apply.js` + `requirement-blocks.js` を参考にするが、フルポートではなく簡素化実装
