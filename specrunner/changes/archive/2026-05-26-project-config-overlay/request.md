# project ごとに config を override 可能にする + request type ごとに step model を切替 + 起動時 validation 強化

## Meta

- **type**: spec-change
- **slug**: project-config-overlay
- **base-branch**: main
- **adr**: true

## 背景

spec-runner は **repo-bound なツール**でありながら、現在 `config.json` は **user global のみ** (`~/.config/specrunner/config.json`)。複数 repo を運用するときに以下が困る:

1. **repo ごとに性格が違う**: research repo は cost 優先 (= sonnet 中心)、production repo は品質優先 (= 重要 step に opus)。user global で 1 つの設定だと両方を満たせない
2. **request type ごとの最適 model が違う**: `bug-fix` (= 修正範囲が明確、設計判断少) は sonnet で十分、`spec-change` + `adr=true` (= architectural decision) は opus 必須。step を 1 軸で固定 model にすると最適化できない
3. **config の不正値が CLI 実行中盤で検出される**: `loadConfig()` 経由で `validateConfig()` は走るが、呼び出すタイミングが command によって異なり、pipeline 中盤で初めて CONFIG_INVALID が出るケースがある

直近セッションの実例:

- **PR #398 (merge-transient-retry, bug-fix) の cost 集計**: design step が opus で **$6.60** = total $10.15 の 65% を占めた。bug-fix 系 request なら design を sonnet にできれば $5+ 削減可能
- **過去 152 PR の cost retrospective**: code-review が opus で動いていたケースで 1 PR $89.50 まで膨らんだ事例あり (= `2026-05-19-gh-cli-to-rest-api`)。type / repo 別に切り替えできれば防げる

memory `cli_design` (= LLM session に state を持たせない、CLI が知識を注入) + `feedback_specrunner_uses_own_cli` (= spec-runner の repo-bound 性質) と整合する自然な拡張。

## 要件

1. **project local config overlay の導入**
   - `<repo-root>/.specrunner/config.json` (= project local) を user global の上に重ねる
   - load 順序:
     1. `~/.config/specrunner/config.json` (= user global) → base
     2. `<repo-root>/.specrunner/config.json` (= project local) → overlay
     3. **deep merge** で project local が user global の値を上書き、不在 key は user global を継承
   - 不在時の挙動:
     - **両方存在**: project local は **partial overlay** として許容 (= 必須 field 全部書かなくて OK、user global の値を継承)
     - **user global なし + project local のみ**: project local は **standalone config として valid** (= `version: 1` + 必須 field を含む完全な schema) でなければならない。部分 config だけだと CONFIG_INVALID
     - **project local なし + user global のみ**: 既存挙動 (= regression なし)
     - **両方なし**: 既存挙動通り、`loadConfig()` が default config を返す or error 出す
   - repo root 解決は既存 `src/util/repo-root.ts` の `resolveRepoRoot()` を再利用

2. **request type ごとの step model 切替 (#314 相当)**
   - schema 拡張: `config.steps.<step>.byRequestType.<request-type>.model` を追加
   - 設計例:
     ```jsonc
     {
       "steps": {
         "defaults": { "model": "claude-sonnet-4-6" },
         "design": { "model": "claude-opus-4-6[1m]" },
         "code-review": {
           "model": "claude-sonnet-4-6",
           "byRequestType": {
             "spec-change": { "model": "claude-opus-4-6[1m]" },
             "new-feature": { "model": "claude-opus-4-6[1m]" }
           }
         }
       }
     }
     ```
   - resolution chain (`getStepExecutionConfig()` の拡張):
     1. `config.steps.<step>.byRequestType.<request-type>.model` (= type 別 step level、最優先)
     2. `config.steps.<step>.model` (= step level)
     3. `config.steps.defaults.byRequestType.<request-type>.model` (= type 別 default)
     4. `config.steps.defaults.model` (= global default)
     5. step 定義のハードコード default (= 最後の保険)
   - schema のトップレベルに `stepsByRequestType` を別建てするか、`steps.<step>.byRequestType` ネストにするかは design step で決定 (= 私の好みは後者、step 中心の構造を維持)

3. **CLI 起動時の validation 強化**
   - 既存 `validateConfig()` を新 schema (= project local overlay + byRequestType) 対応に拡張
   - 各 CLI entry の **最初の段階で明示的に `loadConfig()` (= validation 含む) を呼ぶ** ことで、pipeline 中盤での CONFIG_INVALID escalation を防ぐ
   - 既存挙動 (= 呼び出しタイミングが command によって違う) を統一する
   - error message 改善: 「どの key が不正か」を明示するため、validation error に **path 情報** を含める (= `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model is required` のような)
   - **`byRequestType` の key (= request type 名) の validation 方針**:
     - **空文字列 key を CONFIG_INVALID で reject** (= 必須の structural check)
     - 既知の type 集合 (`bug-fix` / `spec-change` / `new-feature`) と一致しない key は **warning ログのみ** (= reject しない)
     - 理由: parser が `type` field を open string として扱う既存挙動 (= warning のみ、reject しない) と整合させる。将来 type を増やしたとき config schema 変更が不要になる

4. **既存 user global config への影響なし**
   - 本 request 後も既存の `~/.config/specrunner/config.json` 単独運用がそのまま動く (= breaking change なし)
   - `byRequestType` が指定されない場合は既存 resolution chain と完全同等
   - migration 不要、既存 user は何もしなくて OK

5. **doc / template の整備**
   - `src/prompts/rules.ts` の config 言及部分を更新 (project local の存在を明示)
   - `specrunner/project.md` の設定セクションを更新
   - README に project local config の使い方を例示

## スコープ外

- **`~/.specrunner/credentials.json` への移行** — credentials は user global のままで、本 request は config のみ対象
- **環境変数による override** (= `SPECRUNNER_STEP_DESIGN_MODEL=opus` 等の OS env) — config file の階層は本 request の対象、env override は別 request
- **profile / preset 機構** (= 「production preset」「research preset」を切替えるような上位抽象) — 単純な user/project overlay まで、preset 機構は別 request
- **price table embed / USD 換算** — `model` 選択を可能にするが、cost 計算は別 request (= 過去議論で scope 外)
- **動的 model registry 更新** — 単価変動への追随は本 request 対象外、既存 registry を流用
- **project local config の git 管理ワークフロー** — `.specrunner/` は既に `.gitignore` 対象。project local config を team で共有したい場合は別途検討 (例: `.specrunner/config.shared.json` を git 管理にする等) は別 request

## 受け入れ基準

- [ ] `~/.config/specrunner/config.json` (user global) のみで `specrunner job start <slug>` が動く (= 既存挙動の regression なし)
- [ ] `<repo-root>/.specrunner/config.json` (project local) のみで `specrunner job start <slug>` が動く (= user global なしでも project 単独で動作)
- [ ] 両方存在する場合、project local が user global の値を **deep merge で override** する (例: project local に `steps.code-review.model` のみ書けば、他の step は user global を継承)
- [ ] `config.steps.<step>.byRequestType.<request-type>.model` が schema として認識される
- [ ] request type に応じて step model が切り替わる (例: `config.steps.design.byRequestType.spec-change.model = "claude-opus-4-6[1m]"` で spec-change の design は opus、bug-fix では `steps.design.model` の sonnet)
- [ ] resolution chain が要件 2 に書いた順序で動く (= type 別 step level が最優先)
- [ ] `validateConfig()` が `byRequestType` field を validate する: **空文字列 key で `CONFIG_INVALID`**、既知 type 集合外の key は **warning ログ + reject せず通過** (parser の type 扱いと整合)
- [ ] `byRequestType` 内の model field が不正 (= 空文字列 / 非 string) で `CONFIG_INVALID`
- [ ] CLI entry が起動直後に `loadConfig()` (validation 含む) を呼ぶことで、pipeline 中盤での CONFIG_INVALID が消える
- [ ] validation error message に問題の key path が含まれる (= `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model must be a non-empty string`)
- [ ] doc / template (rules.ts / project.md / README) に project local config + byRequestType の使い方が記載されている
- [ ] `bun run typecheck && bun run test` が green
- [ ] 関連 test 追加 (overlay merge / byRequestType resolution / validation error path)

## architect 評価済みの設計判断

- **3 つの要件 (overlay + byRequestType + validation 強化) を 1 request にまとめる**: 3 つは全部 `src/config/` 周辺を触り、schema / load logic / validation が互いに密接に絡む。別 request に切ると **schema 拡張と validation 拡張の semantic conflict が発生しうる** (= 本セッションの PR #389/#390 と同型問題)。1 request で全体整合性を一度に検証する方が安全
- **deep merge vs 完全置換**: deep merge を採用。理由は (i) user が project local で「この step だけ変えたい」という典型ニーズに応える、(ii) `git config global/local` の慣習と整合、(iii) 完全置換だと project local に全 config を書き写す必要があり実用的でない
- **byRequestType の schema 位置**: `steps.<step>.byRequestType` ネスト (= step 中心) vs `stepsByRequestType.<type>.<step>` ネスト (= type 中心) の選択。design step で決定するが、私の意見は **step 中心**: 「この step は普段 sonnet、spec-change だけ opus」が直感的、step を読めば必要 model が一目で分かる
- **validation の早期化**: CLI entry の起動直後で `loadConfig()` を呼ぶ統一は **小さな contract** で大きな user 体験改善になる。pipeline 中盤での failure を防ぎ、設定ミスの即時 feedback を提供
- **price table / USD 換算は scope 外**: 本 request は **model 選択の自由度を上げる** ところまで。コスト計算は別 request (= price table embed) で対応する段階的アプローチ
