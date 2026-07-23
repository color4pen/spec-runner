# ADR-20260723: custom reviewer 全員 skip を構造的 skip として green で通す（canon-binding D6 の反転）

## ステータス

採択

## コンテキスト

`2026-07-22-custom-reviewer-canon-binding` の D6 は、「非空かつ全 member が `skipped`」の round を
`aggregateVerdict` で escalation に格上げし、`ROUND_ALL_MEMBERS_SKIPPED` roundError を設定して
end-of-pipeline で `awaiting-resume` に停止させる設計を導入した。目的は「checked=0 は非 green」
という typed 完了契約の適用だった。

しかし custom reviewer の活性化判定（`activationPaths` / `requestTypes`）は agent 起動前の
決定的計算（git diff + glob）であり、担当外 member は `{kind: "skipped"}` を返す。
「全員担当外」は設定（宣言的 glob）どおりの正当な帰結である。

この設計は以下の実運用上の問題を引き起こした:

1. **自律収束の破壊**: 全レビュワーの `activationPaths` に含まれないディレクトリのみを触る
   request は、実装・PR 作成まで完走した後に必ず operator 介入を要求する。担当外の変更ごとに
   手動 resume が必要となり、pipeline の自律収束が壊れる。
2. **回復経路の不在**: 全 member が skip した状態からの `resume` は同一条件で再び全 member が
   skip → 同一 roundError で再停止する。resume しても収束しない（issue #911 の実測）。
3. **層違いの責務代行**: 担当敷き漏れの検知（coverage floor）は設定層の責務であり、
   runtime の halt で代行するのは層違いである。

加えて、`allMembersSkipped` は roundError 設定の後方 seam（`pipeline.ts` の awaiting-resume 遷移）と
`reviewer-chain.ts` の専用 routing を必要とし、3 つの独立箇所が連動する複雑な停止経路を形成していた。

per-member の skip 事実と理由（activationPaths / requestTypes の不一致内容）は、既存の journaling
経路（`commitRound` → `projectSkip` + `skipHistoryEntry` → events.jsonl への step-attempt record）で
すでに記録されており、観測可能性の基盤は整っていた。

## 決定

### D1 — `aggregateVerdict` の全 skip を approved に戻す（canon-binding D6 反転）

`aggregateVerdict` の「非空かつ全 `skipped` → escalation」分岐を削除し、全 skip が
`hasNeedsFix ? "needs-fix" : "approved"` の approved に落ちるようにする。
escalation 短絡（1 件でも escalation → escalation）と needs-fix 優先は不変。

- **Rationale**: 集約関数は「集約」であり、per-member の verdict 語彙（`verdictOfResult` の
  skipped / escalation / approved）は変えない。全 skip を approved に**集約**するのは
  「skip を approved と同値に統合（verdict 語彙の融合）」ではなく、全 skip を gate 通過値に
  集約するだけである。per-member の verdict は依然 `skipped` として journal に残る。
- **error との区別の維持**: `verdictOfResult` は halt → escalation を返し、`aggregateVerdict` の
  escalation 短絡は不変。skip/error 混在 round は escalation に落ちる。
- **却下: 現状維持（全 skip → escalation）** — 担当外の正当な変更が毎回停止し回復経路もない。
- **却下: skip verdict を approved に書き換え（`verdictOfResult` 変更）** — per-member 証跡が
  approved に化けて「誰が走らなかったか」が消える。verdict 語彙の融合であり却下。

### D2 — 全 skip で roundError を設定しない（sticky error クリアで後方回復成立）

`parallel-review-round.ts` の `allMembersSkipped` 分岐から `ROUND_ALL_MEMBERS_SKIPPED` の
roundError 設定を削除する。roundError は null のまま `commitRound` に渡り、
`state.error = roundError`（`commit-orchestrator.ts:594`）が既存の sticky error を null にクリアする。
observability のため `logPipelineDiag("pipeline:coordinator:all-members-skipped", …)` の
診断ログは残す（error ではなく構造的 skip の痕跡として）。

- **Rationale**: roundError を設けないことが終端 seam の分岐を発火させない（要件 1）と
  旧エラーを持つ既存 job の後方回復（要件 6）を同時に満たす。resume 時に coordinator round が
  再走して全 skip → roundError=null で commit すれば sticky error がクリアされ、
  終端 seam は awaiting-archive に進む。
- **却下: roundError を別の非停止コードに置換** — 停止しないなら error として持つ意味がない。
  終端 seam / routing の条件分岐が残り続ける。error は設定しないのが最小。

### D3 — 全 skip の member を pending に残す（applyRoundResults 抑止 guard 維持）

`parallel-review-round.ts` の `if (!inspectionEscalated && !allMembersSkipped)` guard を
**維持**し、全 skip 時は `applyRoundResults` を適用しない（member status を skipped に確定させず
pending に残す）。

- **Rationale**: `applyRoundResults` は skipped verdict を status `skipped` に確定させ、
  `selectPendingMembers` はそれを job lifetime 恒久に除外する。pending に残せば後続 round
  （fixer が diff を変えた後など）で活性化条件が新しい diff に対して再評価される。
  全 skip を approved に集約しつつ member を pending に留めることで、「skip が恒久 free-pass
  にならない」ことを保証する。
- **却下: 全 skip でも `applyRoundResults` を適用** — 恒久 free-pass 穴を作る。却下。

### D4 — 終端 seam の ROUND_ALL_MEMBERS_SKIPPED 分岐を削除する

`pipeline.ts` の `if (state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED") { … awaiting-resume … }`
分岐を削除し、`nextStep === "end" && state.status === "running"` は常に awaiting-archive へ進む
単一経路にする。

- **Rationale**: D2 で roundError を設けないため分岐条件は恒常的に false になる。dead code を
  残すと将来の読者が「全 skip = 停止」という旧設計を誤読する。除去して意図を明確にする。
- **却下: 分岐を残す** — dead code + 誤読リスク。除去する。

### D5 — reviewer-chain の all-members-skipped escalation routing を削除する

`reviewer-chain.ts` の coordinator `on: "escalation"` かつ `when: error.code ===
"ROUND_ALL_MEMBERS_SKIPPED"` → regression-gate 遷移を削除する。

- **Rationale**: D1 で全 skip は escalation を返さなくなるため、この専用 routing は dead になる。
  skip/error 混在 round（`aggregateVerdict(["skipped","escalation"])` → escalation）は、
  専用 routing 削除後は default escalate → awaiting-resume で従来どおり停止する。
- **却下: 遷移を残す** — dead code であり、将来の誤読リスクを生む。除去する。

### D-journal — per-member skip 証跡は既存経路を保持する

全 skip の member も fulfilled skip 結果として `members` 配列に push され、`commitRound` が
`projectSkip` + `skipHistoryEntry` で state に射影し、store の `persist` が step-attempt record
（skipReason 付き）と transition record を events.jsonl へ append する。本変更はこの経路を変更しない。

- **Rationale**: round は実行し、誰がなぜ skip されたかの証跡を per-member record として残すことで、
  「通して記録する」方針の観測可能性を担保する。専用の all-skip 集約 event は per-member record が
  既に存在するため冗長であり、「round の実行痕跡が消える」round バイパス案とも整合しない。

## 検討した代替案

### A1: 現状維持（全 skip → escalation、D6 維持）

全 skip round を awaiting-resume に停止させ続ける案。

- **Pros**: 設定の担当敷き漏れを runtime の停止シグナルで operator に通知できる。変更リスクがない。
- **Cons**: 担当外の正当な変更が毎回 operator 介入を要求する。resume しても同一条件で再び全員 skip
  → 同一 roundError で再停止し、収束する回復経路が存在しない（issue #911 の実測）。
  自律収束が壊れ、担当外のあらゆる request に手動介入が必要になる。
- **Why not**: 担当判定は宣言的設定（glob）が正であり、「全員担当外」は設定どおりの正当な帰結。
  敷き漏れ検知（coverage floor）は設定層の責務であり、runtime の halt で代行するのは層違い。
  coverage floor は別 request（Non-Goal として明示分離）で扱う。

### A2: round 自体を pipeline からバイパスする

全 skip のとき round の実行自体を省略し、pipeline を次 step に直進させる案。

- **Pros**: pipeline の分岐が減り、コードがシンプルになる。
- **Cons**: round の実行痕跡（誰がどの活性化条件で skip と判定されたか）が journal から完全に消え、
  第三者が run 後に「どのレビュワーがなぜ走らなかったか」を機械的に確認できなくなる。
- **Why not**: 採用方針「round は実行し、構造的 skip として記録する」と矛盾する。
  per-member の skip 証跡（skipReason 付き step-attempt record）による観測可能性が失われる。

### A3: skip を approved と同値に統合（verdict 語彙の融合）

`verdictOfResult` で `skipped` → `approved` に書き換え、per-member 段階で verdict を統合する案。

- **Pros**: 集約関数（`aggregateVerdict`）を変更せず、`verdictOfResult` の 1 箇所のみで済む。
- **Cons**: member session の halt（error）が `verdictOfResult` で escalation を返すのと対称に、
  skip が approved に化けると、error と skip の verdict 区別が失われる。per-member 証跡が
  approved に化けて「誰が走らなかったか」が確認できなくなる。skip/error 混在 round で
  error が skip に紛れる fail-open を作る余地が生じる。
- **Why not**: verdict 語彙は維持し集約層のみで変える、が採用方針。error と skip の区別の維持は
  要件 3 であり、`verdictOfResult` の語彙は不変にする。

## 帰結

**runtime の役割の再定義**:

「全員担当外 = 設定どおりの正当な帰結」として green で通し、「敷き漏れ検知 = 設定層
（coverage floor）の責務」として分離する。runtime は担当外の変更を毎回 halt させることなく
自律収束する。この分離により、runtime の停止シグナルは「本物の異常」にのみ対応するようになる。

**観測可能性の担保**:

per-member の skip 事実と理由（activation 不一致の詳細: 例 `no changed files matched paths [src/auth/**]`）
は既存 journaling 経路で events.jsonl に記録される。「誰がなぜ走らなかったか」を run 後に機械的に
確認できるため、halt による停止と同等以上の観測可能性が担保される。

**error / skip の区別の維持**:

`verdictOfResult`（halt → escalation）と `aggregateVerdict` の escalation 短絡は不変。
skip/error 混在 round は依然 escalation → awaiting-resume で停止する（fail-open なし）。

**後方回復**:

`state.error.code === "ROUND_ALL_MEMBERS_SKIPPED"` を持つ既存の awaiting-resume job は、
resume → coordinator round 再走 → roundError=null で commit → sticky error クリア →
awaiting-archive に到達する。手動 intervention なしで完走する。

**dead code の除去**:

`pipeline.ts` の ROUND_ALL_MEMBERS_SKIPPED 分岐と `reviewer-chain.ts` の専用 escalation routing を
削除し、「全 skip = 停止」という旧設計意図を codebase から除去する。

## 影響を受けるモジュール

- `src/core/pipeline/reviewer-status.ts` — `aggregateVerdict` の全 skip → escalation 分岐削除（D1）
- `src/core/pipeline/parallel-review-round.ts` — `ROUND_ALL_MEMBERS_SKIPPED` roundError 設定削除、
  `allMembersSkipped` guard 維持（D2 / D3）
- `src/core/pipeline/pipeline.ts` — end-of-pipeline ROUND_ALL_MEMBERS_SKIPPED 分岐削除（D4）
- `src/core/pipeline/reviewer-chain.ts` — all-members-skipped escalation routing 削除（D5）
- `src/state/helpers.ts` — sticky error コメントを新挙動（構造的 skip クリア）へ更新

## 参考

- Change: `specrunner/changes/round-all-skip-pass-through/`
- 反転元 ADR: `2026-07-22-custom-reviewer-canon-binding`（D6: 全 skip → escalation を反転）
- 関連 ADR: `2026-07-22-coverage-type-only-structural-skip`（type-only coverage の構造的 skip 同型）
- issue #911: resume が同一エラーで再停止する実測記録（回復経路の不在を確認）
