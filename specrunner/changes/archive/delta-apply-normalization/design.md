# Design: delta-apply-normalization

## Overview

`mergeSpecsForChange` の silent skip 経路を撲滅し、request type に基づく fail/skip 判定を導入する。

## 変更対象

| ファイル | 変更種別 | 概要 |
|----------|----------|------|
| `src/core/finish/spec-merge.ts` | MODIFY | type 読み込み + type 別 skip/fail 分岐 + 空 delta 検出 |
| `src/config/type-config.ts` | MODIFY | `isSpecRequired(type)` helper 追加 |
| `src/prompts/spec-fixer-system.ts` | MODIFY | 正規外 path 禁止を明示 |
| `specrunner/specs/spec-merge/spec.md` | NEW | 新規 capability spec |
| `specrunner/specs/cli-finish-command/spec.md` | MODIFY | Phase 0 check 5,6 削除、check 7 から openspec 除去 |
| `tests/finish-spec-merge.test.ts` | MODIFY | 新規テストケース追加 |

## 設計方針

### 1. type 読み込みの責務配置

`mergeSpecsForChange` が直接 `request.md` を読み取り `parseRequestMdContent` で parse する。理由:

- `mergeSpecsForChange` は `changeFolderPath(slug)` を既に知っている
- orchestrator から type を渡す案は API surface を変えるが、spec-merge は独立して fail/skip 判断すべき（単体テストの容易さ）
- `parseRequestMdContent` は warn-only で unknown type を通すため、spec-merge 内で `TYPE_CONFIG` 照合を独立実行

### 2. type 別 spec 必須性の判定

`type-config.ts` に `specRequired: boolean` field を追加するのではなく、`spec-merge.ts` 内に閉じたロジックとする。理由:

- TYPE_CONFIG は branch prefix / review mode / impact description を定義する場所。spec apply 必須性は merge の内部ポリシー
- ただしルール表の権威ソースは TYPE_CONFIG のキー集合（= 既知 type のリスト）に依存する

具体実装: `spec-merge.ts` 内部に以下を定義:

```typescript
const SPEC_REQUIRED_TYPES = new Set(["spec-change", "new-feature"]);
const SPEC_OPTIONAL_TYPES = new Set(["bug-fix", "refactoring", "chore"]);
```

TYPE_CONFIG に含まれるが REQUIRED にも OPTIONAL にも入らない type は未知 type 扱いで fail。

### 3. 空 delta 検出

`parseDeltaSpec` の結果が `added.length + modified.length + removed.length === 0` の場合を fail とする。これは既存の `validateDeltaSpec` とは別の検証（validateDeltaSpec は format 上の不整合を見る、空 delta は semantic error）。

検出タイミング: capability loop 内、`parseDeltaSpec` 呼び出し直後、`validateDeltaSpec` の前。

### 4. FinishFs への readFile 追加

`mergeSpecsForChange` の params には `fs: FinishFs` があり、`fs.readFile` で `request.md` を読む。追加の dependency injection は不要。

### 5. spec-fixer prompt 更新

`SPEC_FIXER_SYSTEM_PROMPT` の「ファイル配置」セクション（lines 46-50）を拡充。正規外 path の具体例を追加し禁止を明示する。

### 6. cli-finish-command spec 更新

Phase 0 check 表から check 5, 6 を削除。check 7 から `openspec` を除去。関連 Scenario も削除/修正。check 番号は振り直す（旧 7→新 5、旧 8→新 6、旧 9→新 7）。

## 不変条件

- `mergeSpecsForChange` は `archiveChangeFolder` より前に呼ばれる（orchestrator.ts:197 で確認済み、変更なし）
- Pass 1 で 1 capability でも fail したら全 capability の write は行わない（既存挙動維持）
- `mergeSpecsForChange` の既存 params signature (`slug`, `cwd`, `spawn`, `fs`) は変更しない

## テスト戦略

既存テスト (TC-SM-070〜082) は `request.md` を読まない mock を使っている。type 読み込み導入後:

- 既存テスト: `fs.readFile` の mock に `request.md` の内容を追加（type = bug-fix で specs/ 不在は正常 skip を維持する TC-SM-070 のみ修正が必要。あるいは request.md を含む mock に書き換え）
- 新規テスト: type 別分岐を網羅的にカバー
