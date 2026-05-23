# ADR: step 別 rules ファイルによる N 段 follow-up 注入

- **date**: 2026-05-24
- **slug**: per-step-rule-followup
- **status**: accepted

## Context

ADR `2026-05-22-intra-step-follow-up-prompt` で design step に 2 段 follow-up (作業 turn + 1 follow turn) を導入した。この仕組みは「spec-runner 同梱 rules.md を読まなかった」root cause への対策として有効だったが、外部プロジェクト固有の規約 (コーディング規約、評価観点、ドメイン知識) を step 別に注入する経路が存在しなかった。

現状の注入経路は 2 本のみ:

- `RULES_MD_CONTENT` (spec-runner 同梱規律、ハードコード) — change folder にコピーして agent に Read させる
- `project.md` (自由文 1 枚) — design / spec-review / implementer / code-review の 4 step に inline 注入

project.md は全 step 共通であり、step 別の関心ごとを分離できない。さらに、1 turn に複数の指示を詰めると遵守率が劣化する (Lost-in-the-Middle)。

本 ADR は ADR `2026-05-22-intra-step-follow-up-prompt` D2「follow プロンプトは 1 本」を「ファイル数で bounded な N 段」に一般化する。supersede ではなく refine (既存の design step follow-up は引き続き有効)。

## Decisions

### D1: rules ファイル配置パス

`specrunner/rules/<step-name>/<NN-name>.md`

- project root 直下。change folder には置かない (job 横断で共有)
- `<step-name>` は `AGENT_STEP_NAMES` に一致するディレクトリ名のみ有効
- CLI step (`verification` / `pr-create` / `delta-spec-validation`) 配下の rules ファイルは executor が無視する
- `<NN-name>` は数字 prefix (`01-coding-style.md`, `02-domain-terms.md` 等) で昇順ソート
- ファイルの中身は完全自由文。frontmatter なし。CLI は中身を解釈・検証しない

### D2: N 段 follow-up への一般化（ADR 2026-05-22 D2 の refine）

ADR `2026-05-22-intra-step-follow-up-prompt` D2「follow プロンプトは 1 本（bounded な 2 段）」を、「**ファイル数で bounded な N 段**」に一般化する。

- 1 follow turn = 1 ファイル = 1 関心ごと。同一 session 継続
- ファイルが 1 個以上あれば回す、0 個なら何もしない。設定フラグなし
- rules ファイル数が実用的な上限 (5-10 程度) を超えると input token が O(N²) に膨張するが、CLI 側の上限は設けない (利用者の自己責任)

**既存 follow-up との統合**: 既存の design step `followUpPrompt: string` は executor が `followUpPrompts[0]` に配置し、rules follow-ups は `followUpPrompts[1..N]` に続く。port 契約は `AgentRunContext.followUpPrompt?: string` → `followUpPrompts?: string[]` に変更。空配列 `[]` と `undefined` は同義 (follow turn なし)。

### D3: wrap 文言の 3 要素制約

各 rule ファイルの内容を follow turn に変換する際、CLI が付加する wrap 文言は以下の **3 要素に限定**する:

1. **修正範囲**: この規約に関連するファイルのみ修正。関係のないファイルには触れない
2. **stop 条件**: この規約に対する違反がなければ、何も変更せず end_turn する
3. **意図解釈**: 書かれた言葉をそのまま機械的に適用するのではなく、規約の意図を汲んで判断する

**3 要素以外の wrap を CLI が追加することは禁止**。wrap 文言の拡張 (要素の追加・変更) は新 ADR を必要とする。rule の意図解釈と修正の中身は agent の自律に委ねる。

### D4: port 契約変更

`AgentRunContext.followUpPrompt?: string` → `followUpPrompts?: string[]`

- `AgentStep.followUpPrompt` / `getFollowUpPrompt` は変更なし (AgentStep interface に新 field を追加しない原則に準拠)
- executor が `followUpPrompt` → `followUpPrompts[0]` への転記ロジックを持つ
- adapter は `followUpPrompts` のみ参照。`followUpPrompt` は deprecated だが後方互換で残す

### D5: adapter の graceful degradation

ADR `2026-05-22-intra-step-follow-up-prompt` D6 の managed agent graceful degradation を N 段に拡張:

- 各 follow turn は個別に try/catch する
- 1 follow turn の失敗は warning に留め、残りの follow turn は続行する
- AbortController は run() 全体に 1 本。タイムアウト発火時は残り follow turn を含めて中断

### D6: spec-runner 同梱規律の現状維持

`RULES_MD_CONTENT` / `copyRulesToChangeFolder` / system prompt の Read 指示は本 ADR の範囲外として変更しない。将来的に project rules と統合する場合は別 ADR で扱う。

## Alternatives Considered

### Alternative 1: rules ファイルを change folder に配置する

project.md の inline 注入と同様に、change folder に step 別 rules ファイルを置く案。

- **Pros**: change folder に全成果物が集まるため見通しがよい
- **Cons**: change folder は job 固有の成果物置き場であり、複数 job 横断で同じ規約を共有できない。job ごとにコピーが必要になり、規約の一元管理ができない
- **Why not**: project 規約は job 横断で共通であるため、project root 直下に配置して全 job が参照する

### Alternative 2: 複数 rules を 1 ファイルにまとめ 1 follow turn で注入する

step 配下の rules を concat して 1 本の follow turn として投げる案。

- **Pros**: follow turn 数が 1 に固定されるため token cost が O(N) に抑えられる
- **Cons**: 1 turn に複数の関心ごとを詰めると Lost-in-the-Middle 劣化が再発する。これはそもそも本 feature を導入する動機 (project.md の 1 turn 詰め込みの問題) と同じ根本原因
- **Why not**: 1 turn = 1 関心ごとの分離が Lost-in-the-Middle 対策の核心。まとめた時点で効果が失われる

### Alternative 3: project.md の inline 注入を follow-up に降格する

project.md を step の作業 turn 前に inline 注入するのをやめ、follow-up turn として後置きする案。

- **Pros**: project.md も rules ファイルと統一的な follow-up 機構で扱えるようになる
- **Cons**: spec-review / code-review などの review 系 step は、project context を作業 turn 前に知っていなければ review の枠組み自体がズレる。follow-up で後置きすると「context を知らないまま review を書き終えてしまう」事故が起きる
- **Why not**: review 系の品質を守るために project.md の initial inline 注入は維持する (D9)

### Alternative 4: `AgentStep` interface に rules field を追加し step 側で宣言する

```ts
interface AgentStep {
  rulesDir?: string; // "specrunner/rules/implementer" など
}
```

step が自身の rules ディレクトリを宣言し、executor がそれを参照する案。

- **Pros**: step と rules の対応が interface で明示的になる
- **Cons**: rules ディレクトリの有無は filesystem の状態であり、step の interface には不要な結合を持ち込む。新 step を追加するたびに interface 変更が必要になり、extensibility が低下する。また「rules を持たない step」が明示的に `rulesDir: undefined` を書く必要が生じ冗長
- **Why not**: executor がディレクトリ名を `step.name` から動的解決することで、AgentStep interface を変更せずに済む (要件 11)

## Consequences

- `specrunner/rules/<step>/` にファイルを置くだけで step 別の規約注入が可能になる
- 1 turn = 1 関心ごとで Lost-in-the-Middle リスクを緩和できる
- port 契約変更 (`followUpPrompts: string[]`) により全 adapter で N 段 follow-up が動作する
- wrap 文言の 3 要素制約を ADR level で記録することで、将来の拡張に新 ADR を要求する設計境界が明確になる
- N 段の後続 turn で前 turn の制約が巻き戻されるリスクは、修正範囲要素 (= この rule に関連するファイルのみ修正) で touch scope を限定して緩和する

## 関連 ADR

- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — D2 を本 ADR で refine。2 段 → N 段への一般化。
- [2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) — rules.md Read 強制の identity priming 方式。本 ADR が扱う project rules とは別の注入経路。
- [2026-05-23-executor-commit-push-extraction](./2026-05-23-executor-commit-push-extraction.md) — sibling 配置 / free function / dependency object パターン。`rules-resolve.ts` / `rules-followup-prompts.ts` が同パターンを採用。
