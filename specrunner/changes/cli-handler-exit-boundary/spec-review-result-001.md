# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 対象ファイル

- `request.md` — 要件・受け入れ条件・停止条件
- `design.md` — Decisions D1〜D10、Context（実測値）、Risks/Trade-offs、Migration Plan
- `tasks.md` — T-01〜T-12、各タスクの Acceptance Criteria
- `spec.md` — Requirement 5件・Scenario 16件
- `test-cases.md` — TC-001〜TC-031（Total 31件）

### architecture レビュー

**D1（CommandHandler 型変更）**: `Promise<number>` への単一契約変更に shim なしで移行する判断は正当。`strict: true` により `Promise<void>` を返す handler は TS2366 でコンパイルエラーになるため、移行漏れが型検査で網羅される。

**D2（void wrapper 削除）**: `runRun` / `runResume` / `runReopen` の 3 関数は `process.exit(await *Core(...))` の本体しか持たない。削除して handler が `*Core` を直呼びする設計は責務分離として正当。production 呼び出し元が各 1 箇所のみであることを確認（job-start-handler.ts が `runRun` を import している現行コードから確認）。

**D3（try 外 exit）**: dispatch 境界の `process.exit(code)` を try/catch の外に置く設計は、テスト idiom（process.exit を throw する spy）との整合性を保つ上で必須。D3 の Rationale が「try 内に置くと sentinel が自分の catch に捕まり `Fatal: process.exit(0)` の偽出力が発生する」と明示しており正確。TypeScript の definite assignment 解析（catch が `never` で終わるため `code` が確定済みとみなされる）も正しい。

**D5（mask seam 経由の stderr）**: 集約前は `stderrWrite`（maskSensitive 経由）を使う 5 catch が削除されて、境界の生 `process.stderr.write`（マスクなし）に委譲されると secret マスクが後退する。D5 を採用して境界出力を seam 経由にする設計は B-7 invariant の維持として正当。非 secret 入力では出力がバイト一致することを D6 の contract test が担保する。

**D6（base fixture 採取戦略）**: base fixture を production 変更前に単独 commit で確定させ、以降再生成しない戦略は「fixture が candidate から逆算されていないことを git log で検証可能にする」という証明力を持つ。mock 対象を「base / candidate 間で呼び出し関係が変わらない cross-module primitive」（`runArchive`、`detectWorktree`、`buildCommandContext`）に限定する判断も堅固。

**D8（catch 削除判定基準）**: 削除対象 5 件（job-resume-handler / job-archive-handler / reopen / prune / attach）を明文化し、`doctor.ts` の 2 catch を維持する理由（SpecRunnerError を Fatal:/1 に落とす独自挙動 / 独自 Error: 形式）を具体的に説明している。機械的削除の対象を data として固定した設計は適切。

**D9（ratchet AST 検査）**: Check 7〜10 はいずれも `@typescript-eslint/parser` の call expression / 型注釈ノードを対象とし、コメント文字列を誤検出しない設計になっている。各 Check に regression guard（合成ソースで違反を検出できることの確認）を付けることで、ratchet 自体の有効性を担保する設計は既存 Check 1〜6 の様式と一貫している。Check 9 が「ファイル集合の厳密一致」で検査する判断（件数 pin より安定）も正当。

### correctness レビュー

**handler 数の網羅**: T-03（15 handler / 11 module）+ T-04（7 handler / 3 module）+ T-05（3 handler / 3 module）+ T-06（3 handler / 3 module）+ T-07（2 handler / 1 module）= 30 handler / 21 module。request.md の実測値（30件 / 21件）と一致。

**EC ケース数**: T-01 で定義する 23 ケースが request.md 要件 5 の 11 分類を全て覆う（EC-01〜02: 正常 / non-zero 透過、EC-03〜04: usage / semantic 検証 error、EC-05: FlagParseError、EC-06〜08: SpecRunnerError / 予期しない error、EC-09〜12: help / version / no-args、EC-13〜15: unknown command / subcommand / needs-subcommand、EC-16: worktree guard、EC-17: repo guard、EC-18〜23: 早期終了経路）。

**guard 実行順序の保証**: spec.md "guard の実行順序が維持される" Scenario は EC-16 の base/candidate 比較で確認する。entrypoint の guard 起動ロジックは D4 の通り変更しないため、ordering は構造的に保たれる。

**T-10 mock 差し替え**: T-10 の Acceptance Criteria に "assert している options / slug / 呼び出し回数は変更しない" と明記し、値の変更は mock 対象 symbol 名と受け取り方のみに限定している。observable behavior の regression を防ぐ規律として適切。

### completeness レビュー（task decomposition のみ）

T-01〜T-12 が以下を全て覆う:
- base fixture 採取（T-01）
- 型契約変更（T-02）
- 全 30 handler の移行（T-03〜T-07）
- dispatch 境界の実装（T-08）
- JSDoc 更新（T-09）
- テスト追随（T-10）
- ratchet 追加（T-11）
- 全体検証と計測（T-12）

task decomposition の網羅性は十分。

## 検証できなかった項目

- `src/cli/__tests__/fixtures/cli-contract.base.json`（R3a 由来 base fixture）の実ファイル内容: 本レビューでは参照のみ。
- `tests/unit/architecture/arch-allowlist.ts` の `scaffold-handlers.ts` 向け 2 エントリ（design OQ-3 で言及）: 本 request のスコープ外であり、design が明示的に放置と判断しているため不問。

## Findings 詳細

### F-01: T-03 Acceptance Criteria の module 数が本文と不一致

T-03 の Acceptance Criteria 冒頭に「**上記 13 module** の handler がすべて `Promise<number>` を宣言し」とあるが、T-03 本文に列挙される module は 11 件（init.ts / login.ts / credentials.ts / config-effective.ts / inbox.ts / managed.ts / job-show.ts / guide-handler.ts / usage-handler.ts / scaffold-handlers.ts / ps.ts）、Acceptance Criteria の明示ファイル一覧も同じ 11 件。

数値 "13" は、T-04 に分離される前の下書き段階の名残または誤記と推定される。実装者が「残り 2 件はどこか」と混乱する可能性があるが、AC 末尾の具体ファイル一覧が正本であるため実装上の誤りには繋がらない（低リスク）。
