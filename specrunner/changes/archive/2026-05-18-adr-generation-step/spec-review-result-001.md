# Spec Review Result: adr-generation-step (001)

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-18

## Summary

request.md は包括的で設計判断が明確。delta spec 4 本の構造・形式は概ね良好。以下 5 件の指摘がある（Critical 1 / Medium 3 / Low 1）。

---

## Findings

### F-01 [Critical] cli-commands delta spec がアンカー不在の Requirement を MODIFIED している

**場所**: `specs/cli-commands/spec.md`

delta spec は `### Requirement: 'specrunner request template' の scaffold 出力` を MODIFIED しているが、baseline `specrunner/specs/cli-commands/spec.md` にこの Requirement は存在しない。grep で確認済み — baseline の cli-commands spec に "scaffold" / "request template" のキーワードは 0 件。

MODIFIED は「既存 Requirement を書き換える」操作であり、存在しない Requirement を MODIFIED することはできない。`specrunner request template` の scaffold 仕様が baseline spec にないならば、以下のいずれかが必要:

- **案 A**: delta spec を `## ADDED Requirements` に変更し、新規 Requirement として定義する
- **案 B**: cli-commands baseline spec に当該 Requirement が先行 PR で追加される想定なら、その依存を request.md に明記する

現状では spec-merge 時に「対応する baseline Requirement が見つからない」failure が発生する。

**修正**: `## MODIFIED Requirements` → `## ADDED Requirements` に変更するのが最も自然。

---

### F-02 [Medium] request-md-parser delta spec が `ParsedRequest` 型変更を「必須フィールドの欠落はエラーとなる」Requirement に混在させている

**場所**: `specs/request-md-parser/spec.md`

`ParsedRequest interface に adr: boolean field を追加する` という型変更は、エラー Requirement (= 欠落時の挙動) の責務ではなく、パース結果の構造に関する記述。baseline の「request.md は YAML/Markdown ハイブリッド構造でパースされる」Requirement が `ParsedRequest` shape を定義しているので、そちらの MODIFIED として `adr: boolean` を追加するのが正確。

`adr` の validation (= 欠落時 / 不正値の error) は現行の delta spec 配置で正しい。型変更の記述だけ移動すればよい。

**修正**: `ParsedRequest interface に adr: boolean field を追加する` の 1 文を「request.md は YAML/Markdown ハイブリッド構造でパースされる」Requirement の MODIFIED に分離するか、最低限現 Requirement 内で「ParsedRequest 型拡張は既存 Requirement "request.md は YAML/Markdown ハイブリッド構造でパースされる" を参照」と断りを入れる。

---

### F-03 [Medium] design.md D10 で requiresCommit の結論が自己矛盾を含む記述

**場所**: `design.md` D10

D10 の前半で `requiresCommit は true` と書き、後半で `修正: requiresCommit は false にする` と訂正している。読者にとって一読で結論がわからない。delta spec 側 (`adr-generation/spec.md` line 48) は `requiresCommit: false` で確定済み。

**修正**: D10 の見出しを `### D10: requiresCommit は false` に修正し、前半の試行錯誤テキストを削除 or "検討経緯" として折りたたむ。

---

### F-04 [Medium] adr-gen step の no-op 経路で LLM session が起動するコスト設計が request.md の「LLM コスト 0」記述と矛盾

**場所**: request.md 設計判断 4 vs. design.md D3

request.md の 2 段階フィルタ表:
> 段階 1 (= request 宣言) | 人間 (発議者) | `adr: false` → ADR step 起動なし (= LLM コスト 0)

design.md D3:
> step 内 no-op は既存パターン (= completionVerdict: "success" で即 return) に沿っている ... buildMessage 内で request.adr === false を検出し、agent に「ADR 生成不要、即 complete」を指示する短い message を返す

request.md は「起動なし (= LLM コスト 0)」と書いているが、実際には agent session が起動して 1 turn 分のコストが発生する (design.md D3、Risks セクションでも認めている)。request.md の表記を design.md の実態 (= step は起動するが no-op message で 1 turn のみ) に合わせる必要がある。

**修正**: request.md 設計判断 4 の表を「LLM コスト 0」→「LLM コスト最小 (= no-op message 1 turn)」に修正。

---

### F-05 [Low] pipeline-orchestrator delta spec の AgentStepName scenario が baseline の既存 scenario と不整合

**場所**: `specs/pipeline-orchestrator/spec.md` — AgentStepName Requirement

delta spec の Scenario `AgentStepName accepts "adr-gen"` は `"adr-gen"` IS assignable のみを検証している。一方、baseline の既存 Scenario は全 step を列挙して assignable / NOT assignable を明示している:

> `"design"`, `"spec-review"`, `"spec-fixer"`, `"delta-spec-fixer"`, `"test-case-gen"`, `"implementer"`, `"build-fixer"`, `"code-review"`, `"code-fixer"` ARE assignable to `AgentStepName`
> `"verification"`, `"pr-create"`, `"delta-spec-validation"` are NOT assignable

delta spec で「`"adr-gen"` を追加する」と記述しているなら、MODIFIED 後の full scenario を書くか、少なくとも baseline scenario の assignable リストに `"adr-gen"` が追加される旨を明記すべき。現状では spec-merge 後の scenario が古いまま残る。

**修正**: Scenario の THEN 節に `"adr-gen"` を含めた完全リストを書く、または「baseline scenario の assignable リストに `"adr-gen"` を追記する」と明示する。

---

## Security Review

本変更にセキュリティ上の懸念は検出されなかった。

- **入力検証**: `adr` フィールドは `true`/`false` の 2 値のみ受理し、不正値は `REQUEST_MD_INVALID` で reject。regex パターンに ReDoS リスクなし
- **ファイル書き込み**: ADR 生成先は `specrunner/adr/` 固定 prefix。agent が生成するため path traversal の理論的可能性はあるが、既存の agent toolset sandboxing と同レベル
- **認証/OWASP**: 本変更は外部 API / ネットワーク / ユーザー入力の新規 surface を追加しない

---

## Known Design Debt

- `adr: false` 時の no-op agent session 起動は、将来 pipeline 層に「request field による step skip」メカニズムが追加されれば解消可能。現時点では設計上のコスト tradeoff として受容可能
- cli-commands baseline spec に `request template` scaffold の Requirement が存在しないこと自体が、cli-commands spec の網羅性の debt

---

## Verdict Rationale

F-01 (Critical) は spec-merge failure に直結するため、needs-fix とする。F-02〜F-04 は正確性の問題で修正推奨。F-05 は minor だが merge 後の spec 整合性に影響する。
