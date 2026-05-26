# Spec Review Result

- **verdict**: needs-fix
- **request**: gitignore-config-exception
- **type**: spec-change

---

## Summary

設計方針（`.specrunner/*` + `!.specrunner/config.json` の 2 行構成）・ADR・delta spec の形式はいずれも妥当。ただし tasks.md の実装ロジックに **一部の部分存在ケースで誤った gitignore 順序を生成する仕様バグ** がある。このまま implementer に渡すと受け入れ基準の dogfood 検証で失敗する可能性があるため、修正を要求する。

---

## Findings

### F-01 ［correctness / blocker］ tasks.md Step 3 の「末尾追加」が `!` 行が先行する場合に誤順序を生成する

**問題箇所**: `tasks.md` Task 1 ロジック

```
3. `.specrunner/*` 行の有無をチェック、無ければ末尾に追加
4. `!.specrunner/config.json` 行の有無をチェック、無ければ `.specrunner/*` 行の直後に追加
```

Task 3 に挙げられたテストケース「`!.specrunner/config.json` のみ存在（`*` 行なし）」に対してこのアルゴリズムを実行すると:

1. Step 2: 旧形式行なし → skip
2. **Step 3**: `.specrunner/*` 行が無い → **末尾に追加**（`!` 行の後ろ）
3. Step 4: `!.specrunner/config.json` 行がある → no-op

結果として .gitignore に生成される順序:

```
...
!.specrunner/config.json   ← 先行（この時点では何も ignore されていないので no-op）
.specrunner/*              ← 後続（config.json を含む全要素を ignore）
```

git は「後に書かれたパターンが優先」されるため、`.specrunner/*` が最後に来ると `config.json` が ignore される。**本 change の目的を無効化する誤り。**

**修正要求（tasks.md Task 1）**:  
Step 3 を「末尾に追加」から以下に変更:

> `.specrunner/*` 行が無い場合、`.gitignore` 内に `!.specrunner/config.json` 行が既に存在するなら **その直前に挿入**、存在しないなら末尾に追加する。

**修正要求（tasks.md Task 3）**:  
`!.specrunner/config.json` のみ存在ケースのテスト期待値を、生成後のファイル内で `.specrunner/*` が `!.specrunner/config.json` より**前に現れること**として明示する。

---

## Security

- `config.json` の例外は 1 ファイルのみに限定、credentials は user global（`~/.config/specrunner/credentials.json`）に留まる設計は妥当。
- `ensureDotSpecrunnerGitignore` のファイル R/W は `path.join()` 経由で user-input を受け取らず、injection リスクなし。
- OWASP Top 10 の適用対象外（local CLI の gitignore 操作）。

---

## Approved elements

- git の親 dir ignore 配下で `!` 再 include が効かない問題の分析と 2 行構成の選択（D1）は正確。
- 旧形式の自動 migration・idempotent 性の設計（D2）は要件に沿っている。
- delta spec（`cli-commands/spec.md`）: `## Renamed` / `## Requirements` の形式正規、MUST/SHALL keyword あり、scenario あり。
- scope 外として明示された事項（credential 例外化・複数例外 file・Windows 互換）は適切に除外されている。
- Phase 4 doc 更新・Phase 3 repo 自身の .gitignore 更新はタスクとして網羅されている。

---

## Required fix

tasks.md Task 1 の Step 3 と Task 3 の該当テストケース記述を上記 F-01 の通り修正してください。その他の変更は不要です。
