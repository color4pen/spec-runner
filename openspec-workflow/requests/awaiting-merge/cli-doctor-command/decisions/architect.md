# architect decisions — cli-doctor-command (iteration 1)

- ADR filename を `{NNN}-...md` ではなく `ADR-YYYYMMDD-external-dependency-policy.md` に統一する :: `openspec-workflow/adr/README.md` の命名規約および learned-patterns.md L910/L937 の既知の失敗パターンと整合させるため
- delta spec のフォルダ名 `specs/cli/spec.md`（request.md L150 表記） vs `specs/cli-commands/spec.md`（実物） の不整合を spec-review で findings として上げる :: 既存 spec capability 名は `cli-commands` であり、acceptance criteria 内の path 不一致は spec-fixer が掴むべき HIGH 級
- check 数の表記揺れ（request.md「18 個」vs proposal.md What Changes「18 種類」vs tasks.md 列挙個数）を確認し、不整合があれば指摘する :: completeness/consistency observability
- ADR 生成タイミングを Step 7（adr-create skill）に依存させて tasks.md 13.1 を「ADR 草稿の入力提供」に格下げするか議論する :: workflow option `adr` が enabled で adr-create skill が走る前提。tasks.md で implementer が手書き ADR を書くと Step 7 と競合する
- Anthropic API key check 用 endpoint `GET /v1/models` の妥当性を確認する :: D6 で endpoint 選定済み、ただし Managed Agents 制約下で他 endpoint との優劣を確認していない
- D2 で「逐次実行」「並列実行」の選択を MVP では逐次に固定 :: debug 容易性 + rate limit 回避を優先、並列化は v2 オプション
- D7 timeout=5s ＋ openspec check のみ 30s に緩める二重基準を D6/D7 の整合性として findings 化する :: Risks セクションで言及されているが Decisions の本文と Risks で記述が分散しており、spec の readability に影響
- exit 2 を doctor 自身の crash 専用とする規律を `bin/specrunner.ts` の現状実装（catch で exit 1）と整合させる差分を指摘する :: 現行 main().catch は exit 1 のみ。doctor 専用 dispatch で 2 を出す層分担を明示する必要

