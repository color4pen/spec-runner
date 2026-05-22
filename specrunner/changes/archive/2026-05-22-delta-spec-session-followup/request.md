# step 内で作業後に follow プロンプトを 1 本投げて self-fix させる (= intra-step follow-up prompt)

## Meta

- **type**: spec-change
- **slug**: delta-spec-session-followup
- **base-branch**: main
- **adr**: true

<!-- adr=true: step 実行を「作業 1 turn」から「作業 turn + follow プロンプト 1 本」に変える振る舞い変更、adapter 契約に影響 -->

## 背景

PR #359 (job-cancel-command) の事後監査で、design agent が rules.md の format 規律を読まずに delta spec を書き、`## Removed` の format 違反を生んだことが判明した (= session resume でヒアリングし「rules.md を読まなかった」と自認)。

prompt 冒頭の「rules.md を読め」instruction は確率的に skip される (= memory `feedback_llm_uncertainty_principle`)。dsv 拡充 (#361) で検出は強化したが、**「agent が rules.md を読まずに書く」root cause そのもの**は残っている。

## 狙い: 作業直後に follow プロンプトで self-fix を促す

step が作業を終えた直後、**同一 session に follow プロンプトを 1 本投げて「rules.md を読み直して format 違反を直せ」と self-fix させる**。これにより:

- 「読まなかった」root cause を直撃する (= follow プロンプトで読み直しと修正を明示的に促す 2nd pass)
- 違反が後段の dsv ゲートに届く前に self-fix で減らす

### intra-step に閉じる (= pipeline に干渉しない)

follow プロンプトは **step の中で完結**させる:

```
[design step]
  turn 1: 作業 (buildMessage で delta spec を書く)
  follow プロンプト 1 本 (= 同一 live session に投げる)
  → step 終了 (= 1 つの artifact + 1 つの verdict を返す)
[delta-spec-validation]  ← 次の処理は通常通り、無改修
```

- **新 step を作らない / step 遷移を変えない / FIXER_STEP_NAMES を触らない** → pipeline の step machinery に干渉しない
- session は step 内で完結し、次 step に渡るのは file artifact のみ → core 原理 `LLM session に state を持たせない` (= cross-step の session state 依存を作らない) を保つ
- 多 turn の往復「会話」ではなく **follow プロンプト 1 本**の bounded な 2 段

## 用途の整理: self-fix であって検出ゲートではない

この follow プロンプトは **修正 pass であって検出ゲートではない**:

- self-review で「違反してないか判定」させると確認バイアスで穴が空く → **やらない** (memory `feedback_verify_dont_trust`)
- 代わりに「rules.md を読んで**直せ**」という action を指示 (= 判定でなく作業)
- **dsv は決定論的ゲートとして残す** (= self-fix を信用しきらない、belt and suspenders)。self-fix は「ゲート前の best-effort 前掃除」

## 要件

### 1. follow プロンプトを渡す field

`AgentRunContext` (= `src/core/port/agent-runner.ts`) に follow プロンプトを渡す field を追加する SHALL:

```typescript
interface AgentRunContext {
  followUpPrompt?: string;  // 追加: 作業 turn 後に同一 session へ投げる follow プロンプト
}
```

`followUpPrompt` が未指定の step は従来通り作業 turn のみで終了する SHALL (= opt-in、既存 step に影響しない)。

### 2. adapter の 2 段実行 (= 作業 turn → follow プロンプト → 返す)

各 adapter (claude-code / codex / managed-agent) は、`ctx.followUpPrompt` が指定されている場合に以下を SHALL 行う:

1. 作業 turn を実行 (= `buildMessage` で構築した baseMessage を送る)
2. **同一 live session** で follow プロンプトを 1 本投げる (= disk resume でなく in-step の session 継続)
3. follow プロンプト turn 完了後の結果を返す

`followUpPrompt` が未指定なら作業 turn のみで返す (= 既存挙動)。実装は `if (!ctx.followUpPrompt) return result;` の早期 return で既存パスを汚さず分離する SHALL (= module-architect 4-A)。

各 adapter の「同一 session で 2 turn 目を送る」手段 (native、共通化しない):
- **Codex**: 同一 `Thread` instance の `run()` を 2 回呼ぶ (= 最小、既存 Thread 保持で済む)
- **Claude**: `queryFn.prompt` が `string | AsyncIterable` を受けるので、1 query() に作業 prompt → follow prompt を順に流す AsyncIterable 化が「同一 live session」要件に最も忠実 (= 現状 `prompt: string` 固定からの改修)。または作業 turn 直後の session_id で resume する案も可だが、その場合 sessionId が turn 間で変わりうる点に注意
- **managed**: ⚠️ **要件 4 の最初の consumer = design は managed では SSE strategy (`runDesignStyle`) 経路に入り、SSE は streamEvents 1 回で end_turn まで流す設計のため、同一 session で 2 turn 目を送る口が現状コードに存在しない** (= module-architect 4-E、3 adapter 中最も実装の無理が出る箇所)。port には `sendUserMessage(sessionId, text)` + `pollUntilComplete` が存在するため、SSE 後にこれを継ぐ実装は可能と見込まれるが、下記 **外部 API 制約**が未確認

### 外部 API 制約 (= 未確認、設計フェーズで確定要)

**Anthropic Managed Agents API が SSE `end_turn` 後に同一 session への `sendUserMessage` (= multi-turn 継続) を許すかが未確認**。port (`src/core/port/session-client.ts`) には `sendUserMessage` / `pollUntilComplete` / `streamEvents` が定義済みで infra は揃っているが、**API レベルで「SSE turn 完了後に同一 session を継続できるか」は本 request 作成時点で未検証**。

- API が multi-turn 対応 → SSE 後 `sendUserMessage` + `pollUntilComplete` で follow turn を実現
- API が multi-turn 非対応 (= SSE turn で session が閉じる) → managed の design follow turn は別アプローチ (= streamEvents 再呼び出し等) が必要、最悪 scope が変わる

design フェーズの **最初のタスクとして** この API 可否を実機 or 公式ドキュメントで検証する SHALL。API multi-turn 非対応が判明した場合は、**managed adapter の follow turn を別アプローチにするか、本 request の scope から managed を外すかを明示的に判断する** SHALL (= scope 変更の有無を design で確定)。

なお managed SSE 経路の follow turn テスト assertion は手段が design 確定後に定まるため、具体的な mock assertion 方針は **tasks.md / test-cases.md で補完する** (= 本 request では「確定手段で検証できる」までを規定)。

### 2b. 2 段実行の result 集約

作業 turn と follow プロンプト turn の結果を 1 つの `AgentRunResult` に集約する SHALL:

- **modelUsage (= contract)**: **step 終了時点の、その session の累積総 usage** を記録する SHALL。usage 算出は **adapter native** とし、各 adapter が自 SDK の usage 意味論から session 総量を出す:
  - Claude (= 単一 query の cumulative result): 最終 result の modelUsage をそのまま採用 (= 既に session 累積)
  - Codex (= per-turn の Turn.usage): 各 turn を加算して session 総量にする (= naive に `turn` を再代入すると turn 1 が消えるため、加算必須)
  - **shared に「一律加算」を置かない** (= per-turn/cumulative の意味論差で leaky になるため、usage は adapter 責務)
- **sessionId**: turn 1 のものを維持する (= intra-step は同一 session が定義、上書きしない) — shared
- **resultContent**: follow プロンプト turn (= 最終状態) のものを採用する — shared
- **timeout**: 作業 turn + follow プロンプト turn 合算で 1 本の wall-clock とする (= 既存 AbortController が run() 全体に 1 つの構造と整合)

### 3. follow プロンプト turn でも runtime 指示を保つ

follow プロンプト turn でも `buildAdditionalInstructions` (= cwd / branch / project-context 指示) 相当の runtime 文脈が有効である SHALL。同一 session 継続なので作業 turn の system prompt / runtime 指示は session に保持される前提とし、follow プロンプトには**追撃の指示本文のみ**を載せる。

### 4. 最初の consumer: design step の self-fix

design step に `followUpPrompt`「rules.md を読み直して delta spec の format 違反 (= `## Removed` / `## Renamed` / `### Requirement:` header / Scenario 存在 / SHALL/MUST 等) を self-fix せよ」を設定する SHALL。これが本 primitive の最初の利用例。

field 配置 (= module-architect 4-D):
- `AgentStep` interface (`src/core/step/types.ts`) に `followUpPrompt?: string` を追加し、step が宣言する
- executor が `ctx.followUpPrompt = step.followUpPrompt` で転記する (= 既存 `needsProjectContext` → executor 転記と同型、SRP を保つ)

design 段の決定事項:
- follow プロンプトの文面 (= rules.md の該当規律をどこまで明示するか、agent に Read を促すか)
- design 以外の delta-spec-touching step (= spec-fixer 等) にも今回 follow プロンプトを設定するか、design のみに留めるか

### 5. shared / native の境界 (= DRY だが leaky を避ける)

`followUpPrompt` の 2 段実行で、共通化する層と adapter native に残す層を分ける SHALL (= module-architect 2-A、完全共通化は runtime 型差で leaky になる):

- **shared に寄せる** (= runtime 非依存の純粋ロジック): follow turn を実行すべきかの判定 / result 集約のうち **sessionId 維持・resultContent 採用** 部分
- **adapter native に残す**:
  - 「同一 live session で 2 turn 目を送る」操作 (= Claude AsyncIterable or resume / Codex 同一 Thread.run / managed SSE 継続)
  - **modelUsage の session 総量算出** (= per-turn/cumulative の SDK 意味論差があるため shared に出さない、要件 2b)

依存方向は **adapter → shared 純粋関数の一方向**とし、shared が runtime 型 (AsyncGenerator / Turn / poll result) と usage 意味論を知らない設計とする SHALL。`src/adapter/shared/` への配置は既存 `fixer-helpers` の集約パターンと整合。

### 6. 汎用性: 他 step が追加 infra なしで使える

`followUpPrompt` は **step 非依存の汎用 field** とする SHALL。design 以外の step が将来 self-fix follow プロンプトを使う際に、primitive 側の追加改修なしで設定できる状態とする。本 request では design step のみ wiring する (= 他 step は scope 外)。

## スコープ外

- **cross-step session resume** (= 別 step が前 step の session を呼び戻す方式)。本 request は intra-step に閉じる
- **検出の self-review 化** (= follow プロンプトで違反「判定」させる方向、確認バイアスで不採用)
- **多 turn の対話ループ** (= follow プロンプトは 1 本、往復会話にしない)
- **delta-spec-fixer step の改廃** (= 既存 fixer step は無関係、触らない)
- **dsv rule 自体の追加** (= #361 で完了済、別領域)
- **design 以外の step への follow プロンプト wiring** (= 汎用 field は提供するが wiring は scope 外)

## 受け入れ基準

- [ ] `AgentRunContext.followUpPrompt` + `AgentStep.followUpPrompt` が追加され、executor が step → ctx に転記する
- [ ] `followUpPrompt` 未指定時は早期 return で作業 turn のみ (= 既存挙動・既存パス不変)
- [ ] `followUpPrompt` 指定時、3 adapter とも「作業 turn → 同一 session で follow プロンプト 1 本 → 結果返す」の 2 段実行を行う
- [ ] follow プロンプト turn が同一 session 継続で実行される (= proxy assertion を経路別に検証: Codex は同一 thread mock の run 2 回 / Claude は queryFn に渡る prompt 列 / managed polling 経路は sendUserMessage 呼び出し回数 / managed SSE 経路は設計確定後の手段 (= streamEvents 再呼び出し回数 or send 内容) で検証)
- [ ] `followUpPrompt` 指定時、既存 AbortController による wall-clock timeout が作業 turn + follow turn 合算で 1 本として有効である (= 要件 2b、turn ごとに分割されない)
- [ ] `modelUsage` が step 終了時点の session 累積総 usage になっている (= Codex は 2 turn 加算で turn 1 を保持 / Claude は cumulative result そのまま、どちらも turn 取りこぼしなし)
- [ ] modelUsage の session 総量算出が adapter native であり、shared に一律加算ロジックが無い
- [ ] result 集約のうち sessionId (turn 1 維持) / resultContent (follow turn 採用) が shared で、依存が adapter → shared 純粋関数の一方向である
- [ ] shared に寄せた層が runtime 型 (AsyncGenerator / Turn / poll result) と usage 意味論を知らない
- [ ] design step に format self-fix の `followUpPrompt` が設定されている
- [ ] **managed-agent の design で follow プロンプト turn が、設計フェーズで確定した手段により同一 session で実行できる** (= module-architect 4-E + 外部 API 制約。SSE end_turn 後の multi-turn 可否を design で検証し、確定した手段で実装されている)
- [ ] executor / finalizeStep が無改修である (= run() が内部 2 turn でも executor からは 1 回呼び出しに見える)
- [ ] follow プロンプトは pipeline の step 遷移・state machine を変更しない (= 新 step なし、FIXER_STEP_NAMES 無改修)
- [ ] dsv は従来通りゲートとして残り、self-fix の後に実行される
- [ ] claude-code / codex / managed-agent の 3 adapter で動作する unit test がある
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

intra-step model 確定事項:

1. **follow プロンプトは intra-step に閉じる** (= 新 step / step 遷移変更 / FIXER_STEP_NAMES 改修なし)。pipeline machinery に干渉せず、core 原理 (cross-step の session state 非依存) を保つ
2. **follow プロンプトは 1 本** (= 多 turn 対話ループにしない、bounded な 2 段)
3. **self-fix であって検出ゲートではない** (= dsv ゲートは残す、self-review 検出は確認バイアスで不採用)
4. **`followUpPrompt` は step 非依存の汎用 field** (= design 以外も将来 primitive 改修なしで使える)、ただし本 request の wiring は design のみ

module-architect (intra-step 前提で再分析済) の確定事項:

5. **executor 契約不変** (= 4-C): run() が内部 2 turn でも executor からは 1 回 await の 1 result に見える。finalizeStep / state machine 無改修
6. **shared は純粋ロジックまで、turn 送信は native** (= 2-A): 完全共通化は runtime 型差で leaky。依存は adapter → shared 純粋関数の一方向
7. **field は `AgentStep.followUpPrompt` → executor 転記** (= 4-D、`needsProjectContext` と同型)
8. **result マージは純粋関数 / sessionId は turn 1 維持** (= 2-C)

design step に委ねる残論点:

- **managed の design (SSE 経路) で follow turn を同一 session 継続する手段** (= module-architect 4-E、現状コードに口が無い最大リスク。SSE 後 `sendUserMessage` + `pollUntilComplete` を継ぐ / streamEvents 再呼び出し 等を確定要)
- **Claude の 2 turn 目方式**: AsyncIterable で 1 query() に 2 prompt 流す (= 同一 session に忠実) vs 直後 resume (= sessionId が変わりうる)。前者推奨だが現状 `prompt: string` 固定からの改修要
- follow プロンプト文面の詳細 (= rules.md 規律の明示度、Read 指示の有無)
