# propose に baseline spec の参照コンテキストを追加する

## Meta

- **slug**: add-baseline-spec-context
- **type**: new-feature
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator

## 背景

propose agent は baseline spec（`specrunner/specs/<capability>/spec.md`）を参照せずに delta spec を生成している。MODIFIED/REMOVED を書く際に既存の Requirement を知らないため、存在しない Requirement への MODIFIED delta や、矛盾した delta が生成されるリスクがある。

delta merge（PR #195）で finish 時のマージ機構は実装されたが、入力側の品質担保がない。

アーキテクト評価では以下のモデルを推奨:
- DynamicContext に specIndex（capability 名 + Purpose 1行目 + requirement 数）を追加（~1000 トークン）
- propose agent は specIndex を見て関連 baseline を自力で Read する
- 全文注入ではなく agent の判断に委ねる

## 目的

propose agent が baseline spec を認識した上で delta spec を生成できるようにする。

## 要件

1. **DynamicContext に specIndex フィールドを追加** — `src/git/dynamic-context.ts` に `collectSpecIndex()` を実装。`specrunner/specs/*/spec.md` を走査し、capability 名・Purpose 1行目・requirement 数を収集する。`specrunner/specs/` が存在しない場合は空配列を返す（既存の `collectChangesList` と同じフォールバックパターン）。

2. **DynamicContext 型の拡張** — `specIndex: SpecIndexEntry[]` フィールドを追加（`{ capability: string; purpose: string; requirementCount: number }`）。

3. **propose の初期メッセージに specIndex を注入** — `buildInitialMessage` の Repository Context セクションに specIndex テーブルを markdown で注入する。system prompt ではなく initial message に注入する（既存パターンに合わせる）。specIndex が空の場合はセクション自体を出力しない。

4. **buildInitialMessage の引数型を DynamicContext に変更** — 現在の第4引数が `{ changesList?: string[] }` の partial pick になっているのを `DynamicContext` 型に変更する（implementer.ts と同じパターン）。

5. **propose のシステムプロンプトに baseline 参照指示を追加** — path-fence セクション直後に「`specrunner/specs/` 配下の baseline spec の Read は許可する。delta spec を書く前に、対応する baseline spec を Read して既存 Requirement を把握すること」を追加する。

6. **paths.ts の specsDirRel() を使用** — PR #195 で追加済みのユーティリティを活用。

## 受け入れ基準

- [ ] `collectSpecIndex()` が `specrunner/specs/` を走査して index を返す
- [ ] DynamicContext に specIndex が含まれる
- [ ] propose の初期メッセージに specIndex が含まれる
- [ ] propose のシステムプロンプトに baseline 参照指示がある
- [ ] `bun run typecheck` / `bun run test` が全 pass
