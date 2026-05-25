# request 起票から finish までの token usage を `usage.json` に蓄積し可視化する

## Meta

- **type**: new-feature
- **slug**: cost-efficiency-pipeline
- **base-branch**: main
- **adr**: true

## 背景

spec-runner の運用で **コスト効率を測定・最適化する基盤がない**:

1. **`request review` / `request generate` のコスト**: pipeline 外で動く単発 LLM コマンドだが、cost / token usage が **どこにも記録されない**。複数回呼ぶたびに累積するコストが見えない
2. **pipeline 内 step のコスト**: `state.steps[X][attempt].modelUsage` には記録されているが、**集計・可視化する CLI surface がない**。ユーザーは `cat ~/.local/share/specrunner/jobs/*.json | jq ...` のように手動集計するしかなかった (現在は `.specrunner/jobs/` に移行)
3. **過去 PR の retrospective**: archive にコスト記録が残らないため、merge 済 PR の cost を後から振り返れない (現状 jobs/ は `.gitignore` 対象で永続化されない)

過去セッションの cost 集計実例 (= 152 PR で平均 $17.86 / PR、code-review が突出して高い等) は **state file が `~/.local/share/...` に偶然残っていたから可能** だった。今は `.specrunner/jobs/` に移管され gitignore 対象なので、同種の retrospective は再現できない。

### 提案する構造解

request 起票 → review → run → finish の全フェーズで発生するコストを **slug 単位の `usage.json` に蓄積**し、change folder 経由で archive に永続化する。これにより：

- 起票時のコスト (review / generate) も見える
- pipeline コストとセットで集計できる
- archive で永続化、git 管理対象になり、過去 PR の cost retrospective が可能
- 将来 model 切替 (#314) を入れた際に、切替前後の cost 比較が直接できる

## 要件

1. **`usage.json` のスキーマ定義 (append-only)**
   - `specrunner/drafts/<slug>/usage.json` (起票時) → `specrunner/changes/<slug>/usage.json` (pipeline 中) → archive
   - 形式:
     ```json
     {
       "commandInvocations": [
         {
           "command": "request review" | "request generate" | "job",
           "timestamp": "<ISO 8601>",
           "modelUsage": { "<model>": { "inputTokens": N, "outputTokens": N, "cacheReadInputTokens": N, "cacheCreationInputTokens": N }, ... },
           "jobId": "<UUID>" (job のみ),
           "stepName": "<step name>" (job の step 別に分けて記録、複数 entry になる)
         }
       ]
     }
     ```
   - 全 entry は **append のみ**、削除・上書きしない (= history として残す)
   - file 不在時は空構造で初期化

2. **`request review` / `request generate` 実行時に `usage.json` に追記**
   - 各コマンドの内部で LLM 呼び出し後、`drafts/<slug>/usage.json` を read → entry を append → atomic write
   - 既存 file がなければ新規作成
   - 既存 entry は維持 (= 複数回 review しても累積)
   - **slug 解決できない file path で実行された場合** (= `request review` は `<slug>` または `<file-path>` 両方受ける): 該当 draft folder を特定できないため、usage.json への追記は **silent skip** (= warning ログのみで pipeline は中断しない、stdout の review 出力は通常通り)

3. **`job start` 時に draft の `usage.json` を change folder へ引き継ぐ**
   - `runtime/local.ts` / `runtime/managed.ts` で `requestFilePath` をコピーする箇所と同様の流れで `drafts/<slug>/usage.json` を `changes/<slug>/usage.json` にコピー
   - draft folder 削除 (= 既存 `fs.rm` 挙動) より前にコピー実行
   - usage.json が存在しなければ skip (= 初回 run 等で review 未実行のケース)

4. **pipeline 内 step ごとに `changes/<slug>/usage.json` に追記**
   - 各 agent step (spec-review / implementer / code-review / ...) の `modelUsage` を、step 完了時に `changes/<slug>/usage.json` に append
   - 実装方針: `StepExecutor.finalizeStep()` で state.steps に persist する直後に usage.json も更新する (state file と change folder の usage.json は **dual write**、state file が source of truth)
   - もしくは finish 直前に state file から一括 derive する形でも可 (= 単純、live 中は usage.json 更新なし)
   - どちらを採用するかは design step で決定 (実装方針として両案を検討対象)
   - **managed runtime の場合**: `AgentRunResult.modelUsage` が `undefined` (= `readSessionUsage()` が best-effort で usage 取得失敗) のとき、その step の entry は **modelUsage 部分を null (or absent) として記録** する。entry 自体は追加して step / timestamp / jobId は残す

5. **CLI から `usage.json` を集計・表示 (token 数のみ、USD 換算なし)**
   - 新規 subcommand: `specrunner usage [<slug>]`
     - 引数なし: 全 archive を走査して PR ごとの total / step 別 / model 別 **token 数** を表示
     - slug 指定: 該当 change/archive の `usage.json` を詳細表示
   - もしくは既存 `job show` / `ps` に統合する余地もある (= ロード負担、UI 設計次第)
   - 表示形式: `inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens` を model 別 / step 別 / total に集計
   - **USD 換算は本 request では行わない** (= price table 不要)
   - **同一 slug が複数日付の archive に該当する場合** (= `<YYYY-MM-DD>-<slug>` 形式で複数 dir 存在): **最新日付の archive を優先**して表示する

6. **step model の切替 config 確認 (#314 相当、既存機能の検証 + doc 整備)**
   - **位置づけ**: 本 request の主軸 (= cost tracking) ではなく **コスト効率改善のための既存機能の使い方を明示する補助タスク**。可視化 (要件 1-5) で「重い step」が見えた user が、step model 切替で軽量化できる前提を整える
   - `config.steps.<step>.model` (既存) と `config.steps.defaults.model` (既存) の **step-level 設定が機能している**ことを確認 + テスト追加
   - 実装方針: `getStepExecutionConfig()` (`src/config/step-config.ts`) の resolution chain を再検証
   - 設定例を doc / README に追記
   - 新機能追加ではなく既存挙動の確認 + ドキュメント化、設計判断 / pipeline 改修なし

~~7. price table の embed~~ — **本 request の scope から除外** (USD 換算 / 価格計算は別 request)

## スコープ外

- **USD 換算 / price table embed** — token 数の追跡・表示のみ対象、価格計算は本 request では行わない。別 request で扱う (model 別単価が変動する前提で、定数 embed か動的取得かを別途設計)
- **cost limit / budget alert** — 「月 $X 超えたら止める」等の予算制御は別 request (= USD 換算が前提)
- **`finish` 失敗時の partial usage 回復** — `finish` が halt した場合、usage.json は change folder に残るが archive されない。retry で resolve できる範囲、本 request では特別な救済不要
- **multi-runtime (managed vs local) のコスト差分析** — 両 runtime で同じ entry 形式で記録するが、比較分析機能は別 request
- **既存 archive 内の `usage.json` retrofit** — 過去 archive には usage.json が無いまま、retro 生成は対象外
- **draft 段階以外の `request *` コマンド (= `request ls` 等)** — LLM 呼び出しを含むコマンドのみ対象 (review / generate)
- **`specrunner usage` の高度な UI (グラフ / フィルタ / sort)** — 基本的な集計・表示までを scope、高度化は別 request

## 受け入れ基準

- [ ] `specrunner request review <slug>` 実行後、`drafts/<slug>/usage.json` に entry が append されている
- [ ] 同一 draft に対し `request review` を 2 回実行すると `usage.json` の `commandInvocations` array に 2 entry 蓄積される (上書きされない)
- [ ] `specrunner request generate "<text>"` でも同様の挙動
- [ ] `job start <slug>` 実行後、`drafts/<slug>/usage.json` の内容が `changes/<slug>/usage.json` にコピーされている
- [ ] pipeline 完走後、`changes/<slug>/usage.json` に各 step の `modelUsage` entry が追加されている
- [ ] `finish` 後、`archive/<YYYY-MM-DD>-<slug>/usage.json` が永続化されている (= archive move で自動的に含まれる)
- [ ] `specrunner usage <slug>` で対象 PR の total / step 別 / model 別 **token 数** が表示される
- [ ] `specrunner usage` (引数なし) で全 archive 横断のサマリが表示できる (token 数集計のみ、USD なし)
- [ ] `usage.json` が存在しない archive entry (= 本 feature 導入前の旧 archive) は silent に skip され、集計から除外される (error にならない)
- [ ] step model の切替が機能する: `config.steps.spec-review.model = "claude-sonnet-4-6"` 設定で spec-review が sonnet で動く
- [ ] `bun run typecheck && bun run test` が green
- [ ] 関連 test 追加 (usage.json schema / append / コピー / aggregation / CLI 出力)

## architect 評価済みの設計判断

- **append-only schema**: `usage.json` を上書きせず append にすることで、複数回 review / 複数 step 実行を全部 history として残す。過去 cost の retrospective が可能になる
- **保存先の lifecycle (draft → change folder → archive)**: spec-runner の既存 artifact lifecycle (request.md, design.md, tasks.md, *-result.md) と同じ流れに乗せる。archive 自動化のための特別な機構は不要 (= 既存 `archive-change-folder.ts` が dir ごと move するため `usage.json` も自動的に含まれる)
- **state file (`.specrunner/jobs/...`) と usage.json の関係**: state file は **source of truth**、usage.json は **archive 用 derived view**。両者が二重管理になるが、state file は gitignore (per-machine)、usage.json は git 管理 (永続化) で **意図的に分離** している
- **dual write vs derived**: pipeline 中の usage.json 更新を step ごと dual write するか、finish 時に state から一括 derive するかは design step で決定。dual write は live 中に観測可能、derived は単純で source of truth 一元化
- **USD 換算は本 request 対象外**: token 追跡の基盤を最小 scope で確立してから、価格計算を別 request で乗せる段階的アプローチ。price table の単価変動 / multi-model identifier の問題は cost tracking と独立した別軸として切り出す
