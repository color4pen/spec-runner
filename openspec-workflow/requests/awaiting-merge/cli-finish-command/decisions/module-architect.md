# module-architect 判断ログ — cli-finish-command

## 2026-05-01 — 設計判断

- finish を pipeline step に追加せず CLI 単独コマンドとして実装する :: pipeline は per-request lifecycle、finish は post-merge lifecycle で責務が異なる。design Decision 3 の deterministic / no-LLM 方針と矛盾するため
- finish の実装は src/cli/finish.ts + src/core/finish/<step>.ts の 2 層構成に分割する :: tasks.md §2-§10 が 1:1 で sub-step に分かれており、doctor checks 同様の SRP 分割が読みやすさとテスト容易性を最大化する
- tasks.md の path（src/cli/commands/, src/lib/jobs/）は採用しない :: 既存の src/cli/<name>.ts / src/state/schema.ts 規約と乖離しており、cohesion を破壊する。spec-review で tasks.md 側を修正する
- spawnCommand を src/util/spawn.ts に抽出する :: pr-create runner で private 化されている primitive を finish が 9+ 箇所で再利用するため、reusability の観点で先行抽出が必要
- buildGhFailureMessage と gh pr create body-file pattern を src/core/gh/ に共通化する :: pr-create と finish で同一の auth-hint / temp-file 処理が必要となり、duplication 防止
- src/state/store.ts に loadJobState / updateJobState を新設する :: 既存 store は createJobState / listJobStates のみで finish の load-by-id + atomic update をサポートできない。atomicWriteJson を内部利用して既存規約を維持する
- GitHubClient port を拡張せず gh CLI 経由を継続する :: design Decision 2 を踏襲。port は HTTP/REST 読み取り専用で、subprocess 書き込み系を混在させると port の責務が肥大化する
- 全 finish step モジュールに SpawnFn / Fs を DI する :: DoctorContext と同パターン。subprocess を直接 spawn すると unit test が integration test に格下げされ、testability を損なう
- JobStatus union に archived を追加し ps.ts 等の網羅 switch を全件確認する :: design Decision 5 を踏襲。型変更により consumer の exhaustive check が壊れた場合は TypeScript が必ず検知する前提で受け入れる
- finish は標準出力のみで result file を生成しない :: pr-create と異なり parseResult を要する LLM consumer が居ない。escalation block は人間向けでありファイル化は redundant
