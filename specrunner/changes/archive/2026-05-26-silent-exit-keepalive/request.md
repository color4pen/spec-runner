# Bun event loop と pipeline lifecycle の binding 設計で silent exit を構造的に消す (#386 + #399 統合)

## Meta

- **type**: spec-change
- **slug**: silent-exit-keepalive
- **base-branch**: main
- **adr**: true

## 背景

spec-runner は dogfood 中に **silent exit** (= error 無く process が exit、state.status: running のまま) を 2 種類踏んでいる:

1. **#386** = pipeline transition 境界での silent exit
   - spec-review approved 後、次 step (test-case-gen) に進まず exit
   - 観察: parent jsonl は `verdict: approved` で停止、pipeline.ts の `iteration completed` log も出ていない
   - 確証された workaround: `process.stderr.write()` を pipeline.runInternal / executor の 13 ポイントに仕込むと完走 (PR #387 で観測)

2. **#399** = SDK Agent tool 待ちでの silent exit
   - code-review step で sonnet 4.6 が Agent tool (= subagent 起動) を発火
   - Claude Agent SDK が `Agent` を LLM に告知するが host (= spec-runner) に handler 未登録 → tool_result が永遠に返らない → SDK の `for await` が応答待ちで止まる
   - 観察: parent jsonl 最終 entry が `assistant.tool_use` (Agent) で停止
   - 実機検証で **SDK の init tools list に `Task` (= Agent の旧名) が強制告知される**ことを確認: `"tools":["Task","AskUserQuestion","Bash",...,"Read",...]`
   - **検証時の SDK バージョン**: `@anthropic-ai/claude-agent-sdk@^0.2.128` (= `package.json` 記載、検証時点で pre-1.0)。SDK アップグレード時は design step で再検証が必要

### Root cause: lifecycle binding の欠落

```
pipeline lifecycle:   ━━━━━━━━━━━━━━━━━━━━━━━ (まだ step 残ってる)
process lifecycle:    ━━━━━━━━━━╳ exit
                                 ↑
                                 ここで死ぬべきじゃない
```

| 層 | 「生きてる」を主張する責任 |
|---|---|
| **pipeline** | 「次の step ある、まだやる」と思ってる |
| **Bun event loop** | 「pending I/O 見えない、暇だから exit する」 |
| **間の橋渡し** | **無い** (= ここが欠落) |

つまり pipeline がまだ生きてることを event loop に明示する仕組みが無く、両者が独立して動いてるので event loop が先に exit 判定してしまう。

- **Bun 側**: event loop が「pending work なし」を Node より厳格に判定 (= 仕様としては正しい挙動、ただし Node との互換性では regression)
- **spec-runner 側**: async chain が「Node の event loop は緩いから pending なくても少し待つ」という Node 慣習に **暗黙依存**していた

= 「考慮不足」が一番近い言葉。両者の暗黙の前提がズレている。

`process.stderr.write` workaround (#386 PR #387) が示すのは「I/O pending が増えれば exit しない」= **lifecycle binding を構造化すれば直る** ことの実証。

#399 も同じ仮説で説明できる: Agent tool 待ちで pending I/O が消えた瞬間に event loop が exit 判定する。**lifecycle binding を入れれば silent ではなくなる**、ただし tool_result が返らないので **明示 hang に変わる** (= 観察可能、ただし停止)。完全解決には Agent tool 呼び出しの受け方も必要。

= 2 件を別個に対症療法で潰すのは [[feedback_avoid_patchwork]] 違反、1 つの構造解で同時解決を狙う。

### audit で発見した同型構造 (= 3 件目以降の予防)

`getStepExecutionConfig` のような async chain の境界を audit した結果、silent exit 同型の構造が複数箇所に存在:

| 経路 | 状態 |
|---|---|
| pipeline.runInternal の step 遷移境界 | #386 既知 |
| SDK query() の `for await` 境界 | #399 既知 |
| **managed-agent polling 直後** (= `pollUntilComplete()` × 3 箇所) | 構造的に同型、未踏 |
| **finish の git fetch retry sleep** (= preflight / branch-checkout / local-conflict-check) | 構造的に同型、未踏 |
| runner.ts teardown 境界 | 低リスク、ほぼ exit 直前 |

= 全 lifecycle 境界を網羅した keep-alive 設計が必要。

### 関連 SDK issue (Agent tool 経路)

- anthropics/claude-agent-sdk-typescript#87 (OPEN) — built-in agent を disable する手段が公式に無い
- anthropics/claude-agent-sdk-typescript#210 (CLOSED 部分修正) — Agent tool handler 未登録で hang
- anthropics/claude-agent-sdk-typescript#172 / #226 / #293 — subagent 観測性 / 制御の穴

## 要件

### 1. pipeline / process lifecycle binding の確立 (#386 + 同型経路対応)

pipeline / job / step の lifecycle と Node/Bun process の lifecycle を **明示的に bind** する。

**目的**: silent exit を構造的に消す = 「pipeline が生きてる間、process は exit しない」「pipeline が終わったら明示的に exit する」を contract として保証。

**含む内容**:

- **keep-alive token の保持**:
  - pipeline 開始時に長寿命の async work (例: 長寿命 sentinel timer、ref'd Promise) を取得し event loop に登録
  - pipeline 完了時 (= 正常 / timeout / error の全 case) に release
  - 実装手段 (`setImmediate` 毎 iteration / 長寿命 sentinel timer / Promise chain など) は design step で trade-off 評価し選定

- **全 lifecycle 境界への適用**:
  - pipeline.runInternal の step 遷移境界
  - executor の step 内境界
  - managed-agent の `pollUntilComplete()` 経路 × 3 箇所
  - finish の git fetch retry sleep 経路 (preflight / branch-checkout / local-conflict-check)
  - runner.ts の teardown 境界

- **exit 時 invariant の保証**:
  - process が exit する瞬間、job state は必ず **archived / awaiting-merge / awaiting-resume / failed** のいずれか
  - `status: running` のまま exit してはいけない
  - `process.on('beforeExit')` で running 残留を検出 → warning log + `awaiting-resume` に強制遷移
  - `beforeExit` handler は **bool flag で guard し一度だけ実行**する (= async I/O 完了後の再発火対策)

- **明示的 `process.exit()` の呼び出し方針**:
  - pipeline 正常完走時 / timeout 発火時 / fatal error 時に明示的に `process.exit(<code>)` を呼ぶ
  - それ以前の async gap で event loop が「暇」と判定しても keep-alive token で生かす
  - 自然終了任せをやめる (= silent exit の遠因を消す)

- **timeout 機構との整合性**:
  - 既存の step-config の `timeoutMs` が確実に発火 → keep-alive token を release → exit/escalate
  - keep-alive で「絶対 exit しない」状態を作って本当に hang した時に閉じない事態を防ぐ
  - 既存 timeout のロジック (= claude-code agent-runner の AbortController + setTimeout / managed agent の poll timeout) との連動が壊れていないことを test で確認

### 2. Agent tool 呼び出しを silent hang させない受け方 (#399 対応)

SDK の built-in `Agent` / `Task` tool が呼ばれた時、host 側で **必ず応答 (= tool_result) を返す** 経路を確立する。

**目的**: SDK の強制告知 (= LLM の init tools list に `Task` が常に載る) に対して、host で confirmation 経路を持ち、応答無しによる hang を消す。

**実装手段の比較検討** (= design step で実機検証して決定):

| 案 | 内容 |
|---|---|
| (a) `disallowedTools: ["Agent", "Task"]` | LLM の見える tool list から外す。#162 で「prompt-based のみ、API filter 無し」報告あり、効くかは実機検証要 |
| (b) `agents: { ... }` で **no-op subagent 登録** | 即 text を返す handler を SDK に持たせ、subagent loop を SDK 側で完結させる |
| (c) `PreToolUse` hook で Agent を弾く | hooks 経路で host が tool 呼び出しを横取り、redirect text を返す |
| (d) prompt (rules.md) で禁止 | LLM uncertainty で守られない可能性、(a)-(c) の補助としてのみ |

**注意**: `canUseTool` callback は **subagent dispatch が bypass する可能性が高い** (= host の callback まで届かない)。redirect 実装の主軸としては筋外、検証で除外する。

**redirect message の文言**: 「Subagent invocation is disabled. Use Read/Grep/Edit/Bash tools directly to complete the task yourself.」相当の **教育的 text**。reject ではなく redirect として LLM が方針切替しやすい形に。

**redirect retry 上限 + escalation**:
- LLM uncertainty で **指示無視 / 再度 Agent tool 呼ぶ可能性**がある
- 同一 session 内で redirect 発火回数の上限 (= max 3 回程度) を設け、超えたら **step を escalation に倒す**
- 無限 redirect loop を防ぐ contract として保証

### 3. opt-in diagnostic log の常駐化

PR #387 で観測された 13 ポイント診断 log を、`SPECRUNNER_DEBUG=pipeline` env var で **opt-in で恒久化**する。

- 通常運用ではログは出ない、debug 用に再現性を確保
- 既存の verbose log infrastructure (= `.specrunner/logs/`) を再利用、別 log は新設しない

## スコープ外

- **Bun upgrade (v1.3.14 / Rust 版 canary)** — 環境変更は本 request 対象外。設計改善で本質解決を狙う方針 (= upgrade は別 issue / 別 request)。lifecycle binding が入れば現状 v1.3.12 のまま解決可能 (= PR #387 で実証)
- **SDK 側の Agent tool disable 機能を upstream に押し戻す活動** — anthropics/claude-agent-sdk-typescript#87 への寄与は本 request 対象外
- **Subagent 機能を実際に動かす実装** — Agent tool は redirect で受けるのみ、subagent loop を本気で実装するのは将来別 request
- **他 silent failure 系の包括的対応** (#376 anthropic-client v1 silent fallback / #370 module-boundary guard / #377 event 名 typo 未検出) — 別軸の silent failure、別 request で対応
- **既存 cleanup contract の spec 改訂** — 本 request では invariant を実装で保証するに留め、spec 文書としての契約化は別軸

## 受け入れ基準

- [ ] **#386 再現性の解消**: spec-review approved 後の transition で silent exit しない (= `bun run` の e2e で `test-case-gen` まで進む)
- [ ] **#399 再現性の解消**: agent が Agent tool を発火しても silent exit しない (= tool_result として redirect message が返り、agent が継続実行する)
- [ ] **同型経路の解消**: managed polling 直後 / finish git fetch retry 経路でも silent exit しない (= e2e or unit test で keep-alive が effective なことを verify)
- [ ] **exit 時 invariant**: process が exit する瞬間、`state.status === "running"` の job が存在しない (= `process.on('beforeExit')` で観測可能、test で verify)
- [ ] **timeout 整合性**: step-config の `timeoutMs` 発火時に keep-alive token が release され process が exit/escalate する (= 既存 timeout の動作が回帰していない)
- [ ] **redirect retry 上限**: Agent tool が同一 session で redirect 発火回数の上限を超えたら step を escalation に倒す (= 無限 loop 防止、**上限値は design step で決定し確定後に AC を更新**)
- [ ] **明示的 process.exit**: pipeline 正常完走時 / fatal error 時に明示 `process.exit()` が呼ばれる (= 自然終了任せをやめる)
- [ ] **既存パイプライン回帰なし**: 通常の run / resume / finish が以前と同等に動く (= performance / 出力で観測可能な regression なし)
- [ ] **diagnostic log opt-in**: `SPECRUNNER_DEBUG=pipeline` env var で 13 ポイントの境界 log が出る、未設定時は出ない
- [ ] regression test 追加 (= **振る舞いベース**で記述、実装メカニズム (sentinel timer / setImmediate 等) は design で決定後に AC を必要なら更新):
  - assertion 例: keep-alive 機構が active な間は process が自然 exit しないこと / pipeline 完了 / timeout / error で正しく exit すること / Agent tool 呼び出しに対して host が tool_result (redirect message 含む) を返し agent が継続実行すること / step timeout 発火時に process が exit/escalate すること
- [ ] `bun run typecheck && bun run test` が green
- [ ] doc 更新: `specrunner/project.md` に lifecycle binding 設計の存在を 1 段落、`README.md` の troubleshooting に「silent exit が起きたら…」を簡潔に追記

## architect 評価済みの設計判断

- **2 件 (#386 + #399) を 1 request にまとめる**: 両方 root cause が「pipeline lifecycle と process lifecycle の binding 欠落」共通仮説で説明可能、対症療法を別個に当てると [[feedback_avoid_patchwork]] パターン (= 3 件目の silent exit が出た時に構造解にしわ寄せ)。design step で **共通の lifecycle binding contract** を設計し、両方を 1 つの構造で吸収する
- **keep-alive 実装の選択**: `setImmediate` / 長寿命 sentinel timer / 明示的 `Promise.resolve().then()` の 3 案。design step で trade-off 検討 (= 私見は **長寿命 sentinel timer**: 観測性高く、性能影響少なく、`beforeExit` safety net とも整合)
- **Agent tool redirect の文言は LLM-friendly に**: 「permission denied」風の error より「自分でやれ」と redirect する text のほうが model が方針切替しやすい (= [[feedback_llm_uncertainty_principle]] と整合、LLM が判断する場面を消す方向)
- **`canUseTool` を redirect 主軸から外す根拠**: 実機検証で callback が呼ばれず、Python SDK の制約 (= streaming mode 必須) も満たしたうえで動かなかった。SDK が subprocess を起動する造りで permission check が subprocess 内で完結している可能性 + subagent dispatch が host callback を bypass する可能性、両方の経路で筋悪。`disallowedTools` / `agents` no-op / `PreToolUse` hook の 3 案に絞る
- **lifecycle binding は infrastructure 対策、prompt 補強は補助**: rules.md に「Agent tool 使うな」と書く value はあるが、LLM uncertainty で守られないので主軸にしない。書くか否かは implementer 判断に委ねる
- **timeout 整合性は必須の併走検討**: keep-alive で「絶対 exit しない」状態を作るリスク (= 本当に hang した時に閉じない) を timeout 機構との連動で防ぐ
- **明示的 process.exit() の採用**: 「自然終了任せ」を silent exit の遠因と特定、pipeline 完走時 / fatal error 時に明示 exit する方針に転換。Bun event loop の「pending work なし → exit」厳格判定に依存しない設計
