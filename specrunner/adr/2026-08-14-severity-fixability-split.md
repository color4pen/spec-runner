# ADR-20260814: severity と fixability の分離 — LOW も fixable なら直す

## ステータス

accepted

## コンテキスト

### 背景：LOW 除外の起源と二つの先行 ADR

**`2026-08-09-regression-gate-false-loop`（D1/D2）** は以下を確立した。

- `selectFixerTargetFindings`（`judge-verdict.ts`）: `fixable && severity !== "low"` で LOW 除外の唯一の正典とする。
- `excludeKnownUnfixedRegressions`（`findings-ledger.ts`）: regression-gate の verdict 導出直前に、fingerprint 照合で「既知未修正 LOW」を除外する。
- コード・フィクサープロンプト全 5 変種から `Ignore LOW severity findings` 行を削除し、代わりに routing 層で LOW を抑止する。

この設計の根底にあった前提:「LOW を fixer に渡すと LOW が直され、再レビューが走り、同じ LOW が再指摘され、
無限ループになる（livelock）」という歴史的経緯から、LOW を修正対象から一律に落とす方が安全、という判断。

**`2026-07-04-approved-fixer-noop-proceeds`** は別の問題（approved 経路で no-op が escalation に化ける halt）を、
`codeReviewFindingsRoutingActive` 判定で no-op 検知を抑止することで解決した。コメントに
「all fixable findings are LOW severity which the prompt intentionally ignores」と明記しており、
**前段の LOW 除外があることを前提に設計された抑止機構**だった。

### なぜ今、前提が消えたか

livelock の真因は「LOW を修正すること」ではなく「修正後に再レビューへ戻すこと」にある。
observation-auto-fix pipeline（`2026-05-26-observation-auto-fix-pipeline.md`）は既に以下を確立している。

- `deriveJudgeVerdict`: critical/high fixable → `needs-fix`（修正 + 再レビュー）。low/medium fixable → `approved`（approved 経路）。
- approved 経路の code-fixer 完了は **再レビューへ戻さない**（transition が code-review に帰さず次段へ前進する）。
- `approve is stop gate`：approved 到達後のループ再入は構造的に成立しない。

これにより「approved 経路に LOW を含める」と livelock は**構造的に起きない**。
LOW を fix する → approved verdict のまま → 再レビューなし → 前進。

`2026-08-09` の LOW 除外は対症の緩和策であり、根本原因（修正後の再レビュー再入）はすでに別の機構が封じている。
除外を残す理由が構造的に消えた。

### 残存する問題

LOW 除外が残った状態では以下の非一貫性が発生していた。

1. **routing と ledger の非対称**：routing 層は LOW を code-fixer に渡さないが、ledger は LOW も全件保持する。regression-gate が LOW 退行を needs-fix と判定するため、`excludeKnownUnfixedRegressions` で fingerprint 除外を事前に行う必要があった（`2026-08-09` D1）。
2. **「意図的に未修正の LOW」概念の重さ**：routing で落とした LOW が ledger に残り、gate で再登場するため除外機構が必要になる。除外機構は保守対象になるが、LOW 除外が消えれば常に no-op となる死んだ複雑さになる。
3. **approved 経路 no-op の抑止**：code-fixer が LOW を prompt で無視するため no-op は正常だった。この前提が消えると、no-op 抑止は「直すべきものを直さなくても通す」設計に化ける。

## 決定

### D1: `selectFixerTargetFindings` から LOW 除外フィルタを外す（routing 層の統一）

`selectFixerTargetFindings`（`src/core/step/judge-verdict.ts`）の
`.filter((f) => f.severity !== "low")` を除去し、`collectFixableFindings(findings)` と同義（fixable 全件）にする。
関数名・呼び出し構造は維持する（「routing 層が唯一の判定点」という概念の器を保つ）。
関数のコメントおよび呼び出し側コメント（`code-fixer.ts`・`routed-findings.ts`）を実態（fixable 全件を返す）に更新する。

- **Rationale**: LOW を routing 層で落とす理由が構造的に消えた（D6 参照）。関数を削除して `collectFixableFindings` に直接置換すると「唯一の判定点」という命名概念が失われる。フィルタ 1 行の除去が最小かつ意図に忠実。
- **Supersedes**: `2026-08-09-regression-gate-false-loop.md` D2（`severity !== "low"` filter を `selectFixerTargetFindings` に集約した決定）。

### D2: `excludeKnownUnfixedRegressions` を廃止し regression-gate を ledger 全件検証に戻す

`excludeKnownUnfixedRegressions`（`src/core/pipeline/findings-ledger.ts`）を削除し、
`step-completion.ts` の 2 箇所の呼び出し（verdict 導出前フィルタ・永続化整列）を除去する。
regression-gate は ledger 全件（旧・既知未修正 LOW 相当を含む）を最終コードに対して再検証する。
`deriveRegressionGateVerdict`（任意の fixable → needs-fix）の判定ロジックは不変。

`step-completion.ts` の regression-gate 永続化整列ブロック（approved+fixable → code-fixer transition 整列等、
`excludeKnownUnfixedRegressions` と連動していたブロック）も死に体となり削除する。

- **Rationale**: LOW も修正されるため「fixer に回されなかった LOW」という状態が消える。
  除外機構は保守対象としてだけ残る dead flexibility になる。ledger 全件検証に戻すのが一貫する。
  spec-fixer は元々 severity フィルタを持たず LOW も処理していたため、
  ledger の LOW も修正と検証の非対称が解消される。
- **Supersedes**: `2026-08-09-regression-gate-false-loop.md` D1（`excludeKnownUnfixedRegressions` 新設の決定）。

### D3: code-fixer step message を severity 不問の修正義務に統一

`code-fixer.ts` buildMessage の全 5 分岐（conformance / coordinator 集約 / coordinator fallback /
標準 embedded / 標準 findingsPath fallback）の severity 階層化指示
（「Fix all HIGH and CRITICAL ... mandatory / Fix MEDIUM ... only if」）を、
「listed findings をすべて severity を問わず必須で修正する（regardless of severity）」旨の
単一指示へ置き換える。write-scope ガード行（新機能追加・設計変更の禁止等）は保持する。

- **Rationale**: routing 層で fixer に届いた finding は severity で再階層化しないが requirement。
  message が severity 階層を語ると routing 層と二重判定になり、LOW が欠落する。
- **Supersedes**: `2026-08-09-regression-gate-false-loop.md` D2 内の「routing で落としたため prompt の除外指示は不要」という前提（今回は routing で落とさなくなるため、代わりに prompt を全件修正義務に統一する）。

### D4: code-fixer system prompt の severity 再フィルタ（「LOW は無視」）を除去

`code-fixer-system.ts` の旧 format fallback の「severity に基づいて判断する（HIGH は必須、MEDIUM は
設計変更不要の範囲、LOW は無視）」を、severity で選別しない指示（提示された finding はすべて
最小修正で解消する）に置き換える。「Fix: yes の finding: すべて修正する（severity に関わらず）」は
正しいため保持する。spec-fixer system prompt は severity 文言を持たないため無変更。

- **Rationale**: routing 層が唯一の判定点であり、system prompt に severity 再フィルタを持ち込まない。この行は残存する LOW 除外特例であり除去する。

### D5: approved 経路 no-op 抑止機構を廃止（`codeReviewFindingsRoutingActive` / `findingsRoutingApproved`）

`2026-07-04-approved-fixer-noop-proceeds` が追加した no-op 抑止機構を削除する。

- `reviewer-chain.ts` の `codeReviewFindingsRoutingActive` 関数を削除。
- `no-op-detect.ts` の `detectNoOp` から `findingsRoutingApproved` パラメータと、
  `findingsRoutingApproved === true` で `undefined` を返す抑止分岐を削除。
- `executor.ts` の import と `findingsRoutingApproved:` 渡しを削除。

除去後、routed target finding を持つ run で fixer が source（および finding-named path）を変更しなければ
no-op 検知が verdict を `needs-fix` に override する。code-fixer の遷移表に `needs-fix` 行が無いため
`pipeline.ts` の `transition?.to ?? "escalate"` により escalate（terminal）になる。

- **Rationale**: 抑止の前提は「approved 経路の fixable は全部 LOW で、prompt が意図的に無視するから no-op は正常」（ADR コメントに明記）。D1 で LOW が fixer 対象になり前提が消える。architect 判断「LOW/MEDIUM に与えるのは一度きりの修正機会 + 再レビューなしであって no-op の容認ではない」に一致する。escalation は terminal であり再レビューへ戻さないため livelock を生まない。
- **Supersedes**: `2026-07-04-approved-fixer-noop-proceeds.md`（全体）。

### D6: livelock 対策を「直さない」から「再レビューしない」へ置換（意味論の保存）

verdict 導出（`deriveJudgeVerdict`・`deriveSpecReviewVerdict`・`deriveRegressionGateVerdict`）の
判定ロジックは変更しない。

- critical/high fixable → `needs-fix`（修正 + 再レビュー）は不変。
- low/medium fixable → `approved`（approved 経路、修正 + **再レビューなし**）は不変。
- 本変更は「どの finding を fixer に渡すか」と「no-op を許容するか」の層のみを触る。

つまり livelock の対策は「LOW を渡さない（直さない）」から「渡す（直す）が再レビューはしない」へ
置換される。前者は 2026-08-09 ADR の採択、後者は observation-auto-fix pipeline（2026-05-26）が
既に確立していた構造的保証であり、本 ADR はその保証に依拠して除外を解除する。

## 検討した代替案

### A1: LOW 除外を維持し MEDIUM-design-change 問題のみを解決する

LOW を fixable 全件から除外したまま、regression-gate の偽ループ（MEDIUM 残存ループ）だけを別途解決する案。

- **Pros**: 変更範囲が最小。LOW 除外の前提を持つ機構（no-op 抑止 / `excludeKnownUnfixedRegressions`）はそのまま有効。
- **Cons**: livelock の対称対策が既に observation-auto-fix に存在するのに、routing 層の除外だけ残す不一貫が続く。「指摘として妥当で修正方法も明確な LOW が depth が低いという理由で放置される」問題は未解消。
- **Why not**: 前提（livelock が起きる）が構造的に消えており、除外を残す実益が無い。残すと `excludeKnownUnfixedRegressions` という dead flexibility が保守対象になり続ける。

### A2: LOW を渡すが no-op 抑止を維持する（approved 経路 no-op は引き続き許容）

D1/D2/D3/D4 を適用して LOW を fixer に渡すが、D5 の no-op 抑止廃止は見送り、
「直しても直らなくても approved 経路は前進する」設計を維持する案。

- **Pros**: escalation 増加を防げる。既存の no-op 抑止機構を生かせる。
- **Cons**: 「LOW も直す」と宣言しながら no-op で通す設計になる。修正機会は一度きりで再レビューなしであり、no-op の容認は「直すつもりが無い」と同義。抑止機構の前提（「全部 LOW で prompt が無視する」）が D1 で崩れるため、no-op 抑止の識別ロジック（`codeReviewFindingsRoutingActive` の 3 条件 AND）が誤判定を起こすリスクも生じる。
- **Why not**: architect 判断「no-op の容認ではない」。low/medium fixable に与える contract は「一度きりの修正機会」であり、silent pass-through はその契約に反する。

### A3: `selectFixerTargetFindings` を削除し `collectFixableFindings` に直接置換する

関数を消して呼び出し側を `collectFixableFindings` に書き換える案。

- **Pros**: dead wrapper を消せる。行数が減る。
- **Cons**: 「routing 層が fixer 対象選択の唯一の判定点」という命名概念が消え、将来再フィルタが忍び込んだ際に発見しにくくなる。呼び出し元コメントが「selectFixerTargetFindings を使え」という規律を持つため、関数名が参照点になっている。
- **Why not**: フィルタ 1 行の除去のほうが小さい diff で規律の器を保てる。

### A4: LOW を routing で渡しつつ code-fixer prompt 側で severity 再フィルタを残す

`selectFixerTargetFindings` から LOW 除外を外して LOW を fixer に渡すが、
code-fixer の prompt / step message に「LOW は処理しない」旨の severity 条件を残す案。

- **Pros**: routing 層の変更のみで済む。prompt の変更量が減る。
- **Cons**: routing 層が LOW を渡した後、prompt がそれを無視する「渡してから無視させる」二重フィルタが再現する。routing 層が「唯一の判定点」という規律（request.md 要件 4）に直接違反する。routing と prompt の不一致が将来の混乱源になる。
- **Why not**: requirement 4 は「code-fixer / spec-fixer prompt に severity 再フィルタを持ち込まない。routing 層が唯一の判定点」と明文化しており、この案はその規律を構造的に壊す。

### A5: `excludeKnownUnfixedRegressions` を削除せず除外集合を空（LOW → nothing）に縮小する

除外集合の severity 述語を `severity === "low"` から常に `false` に変え、
関数と呼び出し構造は保持したまま実質的に no-op にする案。

- **Pros**: 呼び出し側のコード変更が最小になる。機構を残すため将来 severity 再追加が容易。
- **Cons**: 常に no-op な関数と、その呼び出しが 2 箇所に残る dead code になる。保守対象として残り続けるだけで実益がない。
- **Why not**: 「LOW も修正されるため『fixer に回されなかった LOW』という状態が消える。除外機構は保守対象としてだけ残る死んだ複雑さになる」（design.md D2）。dead flexibility を残すより削除が一貫する。

### A6: `codeReviewFindingsRoutingActive` の no-op 抑止を「routed findings が空のとき」に限定して残す

D5 の全削除の代わりに、判定条件を「routed finding が存在しない（空）場合のみ抑止する」に絞り、
機構自体を縮小して維持する案。

- **Pros**: escalation 増加を部分的に抑止できる。削除よりも変更量が小さい。
- **Cons**: D1 適用後、approved 経路に LOW が含まれるため routed findings が空になるケースは原理的に存在しない。条件が常に偽になり dead branch になる。実質的に全削除と等価な挙動でコードだけ残る。
- **Why not**: D1 後は「approved かつ fixable」経路で routed findings は常に非空になるため、条件が恒偽となり機能しない。削除が一貫する（design.md D5 Alternative (a) にて明示却下）。

## 影響

### Positive

- **LOW fixable finding が修正対象になる**：指摘として妥当で修正方法も明確な finding が severity で落とされなくなる。
- **regression-gate の簡素化**：`excludeKnownUnfixedRegressions` / `computeRegressionLedger` / 永続化整列ブロックが消え、gate は ledger 全件を直接検証する単純な構造になる。「意図的に未修正の LOW」という概念が消滅し、修正と検証の非対称も解消する。
- **approved 経路の no-op が escalation になる**：従来 silent に通っていた「fixer が routed finding を直さない」ケースが escalate（terminal）になる。doc 修正は findingTargetPaths 免除が仕事として数えるため escalate しない。escalation は再レビューへ戻さないため livelock を生まない。
- **fixer prompt の一貫性回復**：routing 層で渡した finding を prompt で再フィルタする二重フィルタが消える。routing 対象 = prompt 指示対象が一致する。

### Negative

- **escalation 件数が増えうる**：approved 経路で code-fixer が source を変更しなかった（かつ finding-named path も変更しなかった）場合が escalation になる。旧来は silent に前進していた。doc-only 修正は findingTargetPaths 免除で問題ないが、fixer が意図的に何もしなかった LOW finding は pipeline halt（`awaiting-resume`）になる。
- **regression-gate が LOW 退行で needs-fix を出す**：旧来は fingerprint 除外で吸収していた LOW の退行が、全件検証で needs-fix になる。ただし gate → code-fixer ループは `REGRESSION_GATE_MAX_ITERATIONS`（3）で有界。

### Known Debt

- **MEDIUM design-change 残存ループ**：`Fix MEDIUM only if no design changes` の意味判断は機械フィルタに移せない。medium-design-change 起因の残存ループが将来顕在化した場合、severity または resolution 述語を拡張して対処する（tracking 継続）。

## 参照

- Request: `specrunner/changes/severity-fixability-split/request.md`
- Design: `specrunner/changes/severity-fixability-split/design.md`
- Supersedes: `specrunner/adr/2026-08-09-regression-gate-false-loop.md`（D1: `excludeKnownUnfixedRegressions`, D2: `selectFixerTargetFindings` の LOW 除外集約）
- Supersedes: `specrunner/adr/2026-07-04-approved-fixer-noop-proceeds.md`（`codeReviewFindingsRoutingActive` / `findingsRoutingApproved` no-op 抑止機構）
- Foundation: `specrunner/adr/2026-05-26-observation-auto-fix-pipeline.md`（approved 経路 = 修正 + 再レビューなし、の構造的保証）
- Related: `specrunner/adr/2026-06-12-reviewer-chain-regression-gate.md`（`regressionGateActive` イディオム定義元）
- Implementation: `src/core/step/judge-verdict.ts` · `src/core/pipeline/findings-ledger.ts` · `src/core/step/step-completion.ts` · `src/core/step/code-fixer.ts` · `src/prompts/code-fixer-system.ts` · `src/core/pipeline/reviewer-chain.ts` · `src/core/step/no-op-detect.ts` · `src/core/step/executor.ts`
