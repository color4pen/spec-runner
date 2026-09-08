# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

- `request.md`、`design.md`、`tasks.md`、`spec.md`、`test-cases.md` を全文確認し、8 Acceptance Criteria を 9 Requirements、T-01〜T-09、TC-001〜TC-034 に追跡した。
- normal/fixer/parallel round/verification の commit-only 化、PR 前後の公開順序、PR なし正常終了、halt policy の job snapshot、legacy=true、signal の local-only、archive/managed runtime 非回帰が相互に整合することを確認した。
- 全 Requirement が `SHALL` または `MUST` と Given/When/Then Scenario を持つことを確認した。
- 現行実装の `src/core/runtime/workspace-materializer.ts` を確認し、新規 job は feature branch を remote に作らず bootstrap commit を local ledger に記録することを確認した。
- 現行実装の `src/core/step/commit-push.ts` を確認し、egress は `git rev-list HEAD --not --remotes=origin` で既知 remote 全体を除外し、初回 feature-branch push にも対応していることを確認した。design の `origin/<branch>..HEAD` とは意味が異なる。
- security 観点では、unknown commit の fail-closed、明示 adopt、managed-path 限定 staging、除外・容量 guard、force push 禁止、remote-ready 表示の成功後限定を確認した。これらは不正/未検査成果の公開防止として妥当である。
- authentication と機密情報保護について、現行 `src/git/transport-auth.ts` の HTTPS extraheader 注入、credential helper 無効化、userinfo 除去、および `LocalRuntime` の authenticated spawn seam を確認し、新しい publish-only capability の仕様・試験にこの契約が固定されているかを確認した。
- OWASP Top 10 のうち本変更に関係する access control、injection、security misconfiguration、authentication failure、logging/data exposure を確認した。Web 入力、HTML、DB、暗号処理は変更対象外である。

## 検証できなかった項目

- 実装前の spec review であるため、実 remote に対する初回 publish、認証付き HTTPS publish、失敗時の credential 非露出は動的には検証できない。いずれも isolated fixture / spawn spy で実装時に検証可能である。
- build/typecheck/test/lint は implementer verification で一度だけ実行する契約のため、この review では重複実行していない。

## Findings 詳細

### F-001: 初回公開時に remote feature branch が存在しない場合の range 定義が成立しない

**対象**: `design.md:36`（関連: `tasks.md:17`、`spec.md:23`、`test-cases.md:40`）

D2 は公開対象を `origin/<branch>..HEAD` と定義しているが、新規 job の現行 materialization は bootstrap commit を local に作るだけで remote feature branch を作らない。この状態で literal に `origin/<branch>` を revision として使うと unknown revision になり、最初の pre-PR publish（または PR なし正常終了 publish）が fail-closed で必ず失敗する。逆に base 全履歴を outgoing と扱えば、base commit は synthesized ledger にないため同様に拒否される。

現行 egress 契約は `HEAD --not --remotes=origin` で remote 上に既にある base ancestry を除外してこの問題を避けている。design/tasks/spec は、remote feature ref が未作成の場合にも「既知 remote ancestry を除いた outgoing OID だけを ledger 照合し、初回 push で feature ref/upstream を作る」等の基準を明記し、bare remote test に remote feature ref 不在の初回公開を明示的に含める必要がある。

### F-002: publication capability の transport authentication と secret-safe diagnostics が仕様・試験に固定されていない

**対象**: `tasks.md:16`（関連: `design.md:36`、`tasks.md:39-53`）

変更は push を step finalizer から新しい Pipeline/CommandRunner 向け capability へ移すが、その capability が LocalRuntime の authenticated spawn seam を必ず使用すること、credential helper を対話的 fallback として有効化しないこと、phase failure の diagnostics に token、Authorization extraheader、credential を含む remote URL を出さないことが規定されていない。既存コードは `transport-auth.ts` と LocalRuntime の wrapper でこれらを担保しているため、composition の変更で raw spawn を注入すると、HTTPS remote の正常な publish が認証失敗するか、失敗詳細の扱いによっては secret が journal/log に残る可能性がある。現在の bare remote / API spy tests は認証不要なのでこの回帰を検出できない。

publish-only が既存 authenticated transport seam を継承し、診断を sanitization 済みの phase/code に限定する設計・タスクを追加するべきである。テストには dummy token を使った引数注入確認と、返却結果・stderr・永続化 state/journal に dummy secret が現れない assertion を含めれば、実 credential や外部 service は不要である。
