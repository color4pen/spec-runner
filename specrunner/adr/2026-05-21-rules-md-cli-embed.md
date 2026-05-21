# ADR: rules.md の source of truth を CLI 内部 string constant に移管する

- **date**: 2026-05-21
- **slug**: rules-md-cli-embed
- **status**: accepted

## Context

[2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) で `specrunner/rules.md` を規律の single source of truth として新設し、change folder へのコピー + Read 強制による identity priming 方式を確立した。

しかし `specrunner/rules.md` を project repo の human-editable file として管理する構造には 3 つの問題が残存していた:

1. **drift リスク**: project owner が `specrunner/rules.md` を編集すると、spec-runner CLI が想定する規律が project ごとに発散する
2. **version 不整合**: CLI を更新しても `specrunner/rules.md` が古いまま残ると、agent に注入される規律と CLI の振る舞いが乖離する
3. **責務分離違反**: rules.md は spec-runner CLI 本体が全 agent に注入する標準規律であり、project repo の file として管理するのは ownership の誤配置である

`specrunner/rules.md` は「project の設定」ではなく「CLI の組み込み定義」であるため、source of truth を CLI コードに移すことが構造的に正しい。

## Decisions

### D1: rules 本文を `src/prompts/rules.ts` の string constant として embed する

```typescript
// src/prompts/rules.ts
export const RULES_MD_CONTENT = `...`;
```

**選択肢と判断**:

| 案 | 評価 | 判断 |
|---|---|---|
| Template literal export（本決定） | build step 不要、`src/prompts/fragments.ts` の `COMMIT_DISCIPLINE` / `PIPELINE_RULES` と同パターン | 採用 |
| Bun `import ... with { type: 'text' }` | Bun 固有、tsc typecheck と干渉リスク | 不採用 |
| Build step で const 化 | overhead が大きく rules ~150 行に対して over-engineering | 不採用 |

### D2: `copyRulesToChangeFolder` を `fs.cp` from disk → `fs.writeFile` from string constant に変更する

- caller signature (`repoRoot, slug, spawnFn`) は変更しない（変更箇所を最小化）
- `repoRoot` は dest path 構築に引き続き必要
- `fs.access` + `fs.cp` + ENOENT try-catch を削除し、`fs.writeFile` 一本に置換する

### D3: ENOENT guard を削除する

string constant を `fs.writeFile` するだけなので、disk read 起因の ENOENT は原理的に発生しない。`specrunner/rules.md not found` 警告ログおよびその assertion テスト (TC-LR-017) は unreachable code として削除する。

理由: unreachable code を残すとテストカバレッジが不必要に下がり、コードの読者を誤解させる。

### D4: `rulesSourcePath()` を `src/util/paths.ts` から削除する

`rulesSourcePath()` は disk 上の `specrunner/rules.md` を指すヘルパーであり、string constant 方式では disk path が不要になる。`rulesDestPath(slug)` は change folder への出力 path として引き続き必要なため残す。

### D5: `specrunner/rules.md` ファイルを repo から削除する

source of truth が CLI コードに移管されたため、project repo 上の `specrunner/rules.md` は削除する。`git ls-files specrunner/rules.md` が空であることで追跡されていないことを保証する。

## Consequences

- `specrunner/rules.md` が repo に存在しなくなり、project owner による意図しない編集が構造的に不可能になる
- CLI version と rules 本文が常に同期する（CLI binary = rules の唯一のバージョニング単位）
- `copyRulesToChangeFolder` から disk I/O の読み取りパスが消え、ENOENT guard も不要になる
- change folder への rules.md 配置動作は外部から見て同一（`specrunner/changes/<slug>/rules.md` として writeFile される）
- `tests/unit/rules-md.test.ts` が `fs.readFile` ではなく `import { RULES_MD_CONTENT }` で content を検証するようになり、disk 状態に依存しないユニットテストになる
- 将来の「project 固有 rules 注入機構」（consumer project ごとに rules を上書き/追加する機能）は本変更を前提として、別 request で設計する

## 関連 ADR

- [2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) — 本 ADR が部分的に update する。rules.md の change folder コピー + Read 強制方式は維持するが、`specrunner/rules.md` を project repo file として新設する決定を CLI embed 方式に変更する。
