## Context

spec-runner の pipeline は `spec-review → test-case-gen → implementer → verification → code-review` の順で実行される。test-case-gen は `test-cases.md` を生成し、GIVEN/WHEN/THEN 形式のシナリオを must / should / could の優先度で定義する。

しかし implementer の system prompt は test-cases.md を読み込む指示を持たず、TDD の言及も「テストを先に書く」という一文のみ。openspec-workflow の `agents/implementer.md` では test-cases.md の読み込み、must シナリオの全実装、GIVEN/WHEN/THEN → テストコード変換、未実装ケースの `test_cases_skipped` 報告が明示されている。

## Goals / Non-Goals

**Goals:**

- implementer が test-cases.md を認知し、must シナリオを全実装する
- GIVEN/WHEN/THEN からテストコードへの変換方針を示す
- 実装不可なケースの報告フォーマットを定義する
- test-cases.md が存在しない場合（test-case-gen 未使用時）のフォールバックを明記する

**Non-Goals:**

- test-case-gen の prompt 改善（#153 で対応）
- implementer のモデル変更
- implementation-notes.md の導入（別 change）
- 構造化された戻り値フォーマットの変更

## Decisions

### D1: prompt への追加箇所

既存の「実装手順」セクションを拡張する。現在のステップ 3 「各タスクを実装する（TDD: テストを先に書く）」を具体化し、test-cases.md の読み込みはステップ 1 のコンテキスト読み込みに追加する。

**理由**: 新セクションを追加するよりも既存の流れに統合した方が、prompt の認知負荷が低い。

### D2: test-cases.md 非存在時の扱い

「存在する場合のみ読み込む。存在しない場合は従来通り tasks.md ベースで TDD を行う」という条件分岐を明記する。

**理由**: test-case-gen は pipeline の optional ステップであり、enabled config で無効化されている場合がある。存在しない場合にエラーにしてはならない。

### D3: 報告フォーマット

openspec-workflow と同じ `test_cases_skipped` フォーマットを採用する。commit message や session output に含めることで、downstream の code-review が Scenario Coverage を正確に評価できる。

```
test_cases_skipped: [TC-001 — 理由]
```

**理由**: openspec-workflow との一貫性。code-review の testing カテゴリが参照するフォーマットと合わせる。
