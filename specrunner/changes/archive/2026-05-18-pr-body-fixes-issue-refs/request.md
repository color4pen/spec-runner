# PR body に request.md の issue 参照を `Fixes #N` として自動付与する

## Meta

- **type**: bug-fix
- **slug**: pr-body-fixes-issue-refs
- **base-branch**: main
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #264

## 背景

`pr-create` step が PR を作成する際、PR body に request.md の `issue` field (Meta セクション) を `Fixes #N` 形式で挿入していない。結果として PR merge しても **GitHub が関連 issue を auto-close しない**。

### 観測例 (= 直近 dogfood で累積)

- #269 (code-fixer 最終 iter) → PR #273 で解決済だが auto-close されず、ユーザーが手動で `gh issue close 269 -c "Resolved by #273"` 実行
- #270 → PR #276 で解決済 (同上)
- #272 → PR #274 で解決済 (同上)
- #277 → PR #284 で解決済 (同上、merge 直後に確認必要)
- #275 → PR #281 で解決済 (同上)

直近 1 session で 5 件の手動 close が発生 (= 構造的負債、毎 PR で発生)。

### 修正対象

`src/core/pr-create/body-template.ts` の `renderPrBody` 関数。現状の body template に `Fixes #N` 行が無いため、`parsedRequest.issue` (or 同等の field) を読み取って body に挿入する。

関連 issue: #264

## 目的

PR merge と同時に関連 issue が GitHub 上で auto-close されるようにし、手動 close の手間を恒久解消する。

## 設計判断

1. **採用案: `renderPrBody` で `parsedRequest.issue` から `Fixes #N` 行を生成**
   - request.md の Meta セクション `- **issue**: #279` 等を parser が既に取り出している前提 (= 確認必要)
   - body の冒頭か末尾に `Fixes #<num>` を挿入
   - GitHub の auto-close keyword は `Fixes / Closes / Resolves` のいずれでも OK、`Fixes` を採用 (= 既に手動 close で使ってる文言)

2. **issue が複数の場合の扱い**: request.md の Meta `issue` field は単数想定だが、配列対応するか。現状の parser 実装を確認して判断:
   - 単数のみ: そのまま `Fixes #N` 1 行
   - 配列: 各 issue を改行区切りで `Fixes #N1\nFixes #N2`

3. **issue 不在の場合**: request.md に `issue` field が無い request (= 過去の多くの request) では body 変更なし (= 既存挙動維持、auto-close 無し)

4. **既存 PR body 内容との衝突回避**:
   - 現状 `renderPrBody` が出力する section と重複しない場所に挿入
   - 既存 test (= `body-template.test.ts` 等) の regression に注意

5. **不採用案: PR description に `Fixes #N` を入れず、merge commit message で扱う**
   - GitHub auto-close は PR description (= body) でも commit message でも動作するが、PR body の方が UI 上見やすい
   - 既存 squash merge では PR title + body が commit message になるため、body 経由で十分

## 要件

### 1. `renderPrBody` で `Fixes #N` 行を追加

`src/core/pr-create/body-template.ts`:

- `parsedRequest.issue` (or 同等の field、parser 実装を確認) を読み取る
- 値が存在する場合に body に `Fixes #<num>` 行を追加
- 値が不在の場合は既存挙動を維持
- 挿入位置は body 冒頭の summary 直後 (= GitHub UI で目立つ位置) を推奨。既存 template 構造を確認して決定

### 2. parser 確認 (= 必要に応じて)

request.md の `- **issue**: #<num>` を parser がどう扱っているか確認:

- `src/core/request/parser.ts` (or 同等) で issue field が抽出されているか
- 抽出されていなければ parser に追加 (= 必要なら request 内 scope に含める)
- 抽出されていれば `parsedRequest.issue` (or 同等の型) でアクセス可能

### 3. test

`tests/unit/core/pr-create/body-template.test.ts` (新規 or 既存追加):

- TC: `parsedRequest.issue = "#264"` (= string with `#` prefix) のとき body に `Fixes #264` が含まれる (= 変換式は `Fixes ${issue}`)
- TC: `parsedRequest.issue = undefined` のとき body に `Fixes` 行が含まれない (= regression なし)
- TC: 複数 issue サポートしている場合は配列で複数 `Fixes` 行が出る (= 必要に応じて)

issue field の形式は **string with `#` prefix** (= `"#264"`) とし、body-template の変換式は `Fixes ${issue}` で連結すると `Fixes #264` が出力される。numeric (= `264`) を扱う場合は parser 側で `#` 付き正規化するか、template 側で `Fixes #${stripHash(issue)}` 形式に揃える (= parser 実装を確認して決定)。

### 4. 既存 test の regression 確認

`bun run test` で既存 body-template / pr-create 関連 test が pass し続けることを確認。

### 5. spec authority への反映 (= 2 spec 同時 MODIFIED)

#### 5-a. pr-create 関連 spec

`specrunner/specs/<pr-create 関連 capability>/spec.md` を MODIFIED で更新:

- Requirement「PR body は request.md の `issue` field を `Fixes #N` 形式で含む」追加
- Scenario:
  - request.md に `issue: #279` がある → PR body に `Fixes #279` が含まれる
  - request.md に issue field が無い → PR body に `Fixes` 行が含まれない

該当 capability は `pr-create` 関連 (= `pipeline-orchestrator/spec.md` 内 or 独立 capability、baseline 確認して特定)。

#### 5-b. request.md parser 関連 spec (= 要件 2 で parser 拡張する場合)

要件 2 で `request-md-parser` (or 同等) に `issue` field 抽出ロジックを追加する場合:

`specrunner/specs/request-md-parser/spec.md` (baseline 確認して特定) を MODIFIED で更新:

- Requirement「parser は request.md Meta セクションの `issue` field を抽出する」追加
- Scenario:
  - `- **issue**: #279` → `parsedRequest.issue = "#279"` (= string、`#` prefix 含む形式)
  - issue field 不在 → `parsedRequest.issue = undefined`

parser が既に issue を抽出している場合は本 5-b はスコープ外 (= 既存挙動維持、確認のみ)。

## スコープ外

- request.md の `issue` field 形式変更 (= `#279` vs `279` vs `[#279, #280]` 等のスキーマ議論)
- 既存 close 漏れ issue の手動 close (= 直近 5 件は既に手動 close 済)
- GitHub auto-close keyword の選定 (= `Fixes` に固定)
- PR body の他要素 (= test plan / summary 等) のリッチ化

## 受け入れ基準

- [ ] `src/core/pr-create/body-template.ts` の `renderPrBody` が `parsedRequest.issue` を読み取って `Fixes #N` 行を追加する
- [ ] issue field 不在のとき body 変更なし (= regression なし)
- [ ] 新規 unit test が pass
- [ ] 既存 body-template / pr-create 関連 test が regression していない
- [ ] `bun run typecheck && bun run test` が green
- [ ] spec authority に Requirement が反映されている
- [ ] 動作確認: 本 request 自体の PR (= `issue: #264` を含む) が merge されると issue #264 が auto-close される

## Workflow Options

- enabled: []
