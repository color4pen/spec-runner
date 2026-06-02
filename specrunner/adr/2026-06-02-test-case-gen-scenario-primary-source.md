# ADR: test-case-gen の入力源を delta spec Scenario に変更する

- **Date**: 2026-06-02
- **Status**: Accepted
- **Slug**: test-cases-from-spec-scenarios

## Context

test-case-gen step は `design.md` / `tasks.md` から testable behaviors を抽出して `test-cases.md` を生成していた。delta spec の Scenario（given/when/then）は参照されておらず、spec の受け入れ条件と test case が構造的に紐づいていなかった。

この状態では spec を書いても test の source にならない。「spec = claim、test = proof」の対応が成立するには、Scenario が acceptance test の直接の source である必要がある。

## Decision

test-case-gen の system prompt と `TEST_CASES_TEMPLATE` のみ変更し、step 定義・pipeline は変更しない。

1. system prompt の `Testable Behaviors Extraction` セクションを delta spec Scenario primary に書き換える
2. `Coverage Requirements` の網羅基準を task 単位から Scenario 単位に変更する
3. `TEST_CASES_TEMPLATE` の Source フィールド説明を delta spec Scenario 参照形式に更新する
4. initial message に delta spec ファイルの読み取り手順を追加する
5. delta spec 不在時は design.md / tasks.md へフォールバックする（後方互換）

## Design Decisions

### D1: prompt 変更のみ、step 定義・pipeline は不変

**選択**: `test-case-gen-system.ts` と `step-output-templates.ts` のテキストのみ変更する。`test-case-gen.ts`（step 定義）や `pipeline.ts` は変更しない。

**理由**: test-case-gen agent は既に Read tool で worktree 内の任意ファイルを参照できる。delta spec の読み取りは prompt の指示で完結し、step 定義への新しい入力パスや依存注入は不要。

**却下案**: delta spec content を `buildMessage` で事前読み取りして initial message に埋め込む → agent は Read tool で読めるため不要。capability 数が不定のため事前読み取りが複雑になり、message が肥大化する。

### D2: Source フィールド形式を breadcrumb 形式にする

**選択**: `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` とする。

**理由**: Source フィールドは現状 machine-parsed されていない（verification step は TC ID のみ grep）。人間の traceability が主目的であり、`>` 区切りは Markdown 内で自然に読める。既存の `design.md > section` 形式と一貫性もある。

**却下案**: `Scenario: <name> (specs/<cap>/spec.md)` 形式 → breadcrumb 順序が逆で辿りにくい。

### D3: delta spec 不在時は design.md / tasks.md フォールバック

**選択**: system prompt に「delta spec が存在しない場合は design.md / tasks.md から抽出」のフォールバック指示を記載する。

**理由**: bug-fix type など全ての change が delta spec を持つわけではない。後方互換を維持し、delta spec なしの change でも test-case-gen が動作する必要がある。

**却下案**: delta spec 必須にして不在時は step を fail → bug-fix 等で spec 不要な change が存在するため却下。

### D4: Coverage Requirements の基準を Scenario 単位に変更

**選択**: 「Every task in tasks.md must have at least one test case」を「Every Scenario in delta spec must have at least one test case」に変更する。

**理由**: Scenario が acceptance test の正典である以上、coverage の基準も Scenario に合わせる。task 単位の網羅では spec の Scenario が検証されない空白が生まれる。

## Alternatives Considered

### Alternative 1: design.md / tasks.md と delta spec を並列 source にする

Scenario も design.md セクションも等価な source として扱い、どちらから test case を生成しても良いとする案。

- **Pros**: 既存の test-case-gen 出力との互換性が高い
- **Cons**: 「spec が acceptance test の source」という原則が曖昧になる。Scenario 由来でない acceptance test が混入し、spec の網羅範囲の正典にならない
- **Why not**: 本変更の核心要件は「Scenario が acceptance test の source になること」。並列扱いでは spec の存在理由が「下流が読まない監査文書」から変わらない。

### Alternative 2: step 定義に delta spec path を入力として注入する

`test-case-gen.ts` に delta spec path を explicit input として持たせ、pipeline が注入する案。

- **Pros**: 入力依存が型安全になる。agent が path 探索を誤るリスクがない
- **Cons**: capability ディレクトリ構造は動的（capability 名は agent が判断）であり、pipeline 実行時に全パスを静的に列挙できない。step 定義と pipeline への変更面積が大きい
- **Why not**: agent は Read tool で change folder 内を探索できる。prompt 指示で十分であり、step 定義変更のコストに見合わない。

## Consequences

- `test-cases.md` の acceptance test が delta spec の Scenario に 1:1 以上で対応し、Scenario → test case の写像が辿れるようになる
- `TEST_CASES_TEMPLATE` の Source フィールド形式が `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` に統一される
- coverage の網羅基準が Scenario 単位になり、task 定義に依存しなくなる
- delta spec を持たない bug-fix change では従来通り design.md / tasks.md から生成される（後方互換）

## References

- Request: `specrunner/changes/test-cases-from-spec-scenarios/request.md`
- Design: `specrunner/changes/test-cases-from-spec-scenarios/design.md`
- Related: `specrunner/adr/2026-05-27-step-output-template-injection.md`（TEST_CASES_TEMPLATE の確立）
