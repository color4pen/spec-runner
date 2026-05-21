# Spec Review Result: adr-generation-step (002)

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-18

## Summary

spec-review-result-001 の 5 件の指摘に対し、delta spec の修正状況を再評価した。F-01 (Critical) が未修正のまま残っている。加えて新規指摘 1 件 (Medium) を追加する。全体として構造・設計は明確で、修正は局所的。

---

## Findings

### F-01 [Critical] cli-commands delta spec が MODIFIED だが baseline にアンカー Requirement が存在しない (001-F-01 未修正)

**場所**: `specs/cli-commands/spec.md`

delta spec は `## ADDED Requirements` ではなく、文面上「既存 Requirement の scaffold 出力仕様に追加する」と MODIFIED を示唆する導入文がある。しかし baseline `specrunner/specs/cli-commands/spec.md` に `scaffold` / `request template` を含む Requirement は存在しない (grep 確認済み)。

spec-merge 時に「対応する baseline Requirement が見つからない」failure が発生する。

**修正**: `## ADDED Requirements` ヘッダは既に正しく記載されているが、本文冒頭の「以下を既存 Requirement の scaffold 出力仕様に追加する」の 1 文が矛盾を生んでいる。この導入文を削除するか、「新規 Requirement として定義する」に書き換える。Requirement 見出しもアンカー参照を含まない独立形に修正する。

---

### F-02 [Medium] request-md-parser delta spec の `ParsedRequest` 型拡張が Requirement 責務と不一致 (001-F-02 未修正)

**場所**: `specs/request-md-parser/spec.md`

`ParsedRequest interface に adr: boolean field を追加する` という型変更は、「必須フィールドの欠落はエラーとなる」Requirement ではなく、「request.md は YAML/Markdown ハイブリッド構造でパースされる」Requirement (= `ParsedRequest` shape を定義する Requirement) の MODIFIED として記述すべき。

現状の delta spec では 2 つ目の `### Requirement: request.md は YAML/Markdown ハイブリッド構造でパースされる` セクションに 1 行だけ記述があるが、これ自体は方向として正しい。ただし「以下を既存 Requirement に追加する」の導入文の後に内容が `ParsedRequest interface に adr: boolean field を追加する` の 1 文しかなく、delta spec の形式として MODIFIED Requirement の書き直し (= Scenario 付き) が不足している。

**修正**: 「request.md は YAML/Markdown ハイブリッド構造でパースされる」の MODIFIED セクションに、`ParsedRequest` の return 値に `adr: boolean` が含まれることを示す Scenario を追加する (例: `adr: true` の request.md → `parsedRequest.adr === true`)。既に「必須フィールドの欠落はエラーとなる」側に parse 成功 Scenario があるので重複しないよう、型拡張の宣言に留めてもよい。

---

### F-03 [Resolved] design.md D10 の自己矛盾 (001-F-03)

design.md D10 の見出しは `### D10: requiresCommit は false` で結論が明確。本文も「検討経緯」として false にする理由が整理されている。**修正済みと判断する。**

---

### F-04 [Low → Acceptable] request.md の「LLM コスト 0」記述 (001-F-04)

request.md の 2 段階フィルタ表に「ADR step 起動なし (= LLM コスト 0)」、design.md D3 / Risks に「no-op message で 1 turn」とある矛盾は残っている。ただし request.md は発議者の意図を記述するドキュメントであり、delta spec 側 (`adr-generation/spec.md`) は「no-op で通過する。agent に no-op 指示の短い message を送り」と正確に記述している。**spec の正確性は確保されており、request.md の表記 imprecision は実装に影響しないため severity を下げる。** 修正推奨だが blocking ではない。

---

### F-05 [Low → Acceptable] pipeline-orchestrator AgentStepName scenario の full list (001-F-05)

delta spec の Scenario は `"adr-gen"` を含めた完全リストを書いている (line 90: `"design"`, `"spec-review"`, ..., `"adr-gen"` ARE assignable)。NOT assignable リストも維持されている。**修正済みと判断する。**

---

### F-06 [Medium] (新規) tasks.md の `request-generate-system.ts` 拡張タスクに対応する delta spec が不在

**場所**: tasks.md Task 7 vs. delta specs

tasks.md の Task 7 は `src/prompts/request-generate-system.ts` に `adr` フィールドの説明と判断基準を追加する作業を定義している。request.md 要件 2 も同様。しかし、`request-generate-system.ts` の prompt 変更に対応する delta spec が存在しない。

`request-generate-system.ts` は既存ファイルとして存在する (= 確認済み) が、baseline spec のどの capability が管轄するかは不明瞭。implementer が作業する際、仕様的裏付けなく prompt を変更することになる。

**修正案**:
- (A) `specs/cli-commands/spec.md` の ADDED Requirements に「`specrunner request generate` prompt に adr フィールド判断基準を含める」Requirement を追加する
- (B) `request-generate-system.ts` の変更は prompt の内部品質向上であり delta spec 不要と判断し、tasks.md にその旨を注記する
- (C) 新規 capability `request-generation` の delta spec として切り出す

いずれかを選択して明示すること。

---

## Security Review

前回 (001) の評価を維持する。本変更にセキュリティ上の懸念は検出されなかった。

- **入力検証**: `adr` フィールドは `true`/`false` の 2 値のみ受理、不正値は reject。ReDoS リスクなし
- **ファイル書き込み**: `specrunner/adr/` 固定 prefix。agent toolset sandboxing と同レベル
- **認証/OWASP**: 外部 API / ネットワーク / ユーザー入力の新規 surface なし

---

## Known Design Debt

- `adr: false` 時の no-op agent session 起動 (= 将来 pipeline 層 skip mechanism で解消可能)
- cli-commands baseline spec に `request template` scaffold の Requirement が存在しない (= 本変更の ADDED で部分的に解消されるが、既存 scaffold 仕様全体の spec 化は未着手)

---

## Verdict Rationale

F-01 (Critical) は delta spec のヘッダ/導入文の不整合であり、spec-merge で failure を引き起こす。F-06 (Medium) は仕様カバレッジの穴。いずれも局所的な修正で解消可能だが、現状のままでは needs-fix とする。

F-03, F-05 は修正済み。F-04 は severity を下げ non-blocking とする。
