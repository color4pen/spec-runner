# Design: guide 正本の正確性硬化

## Context

`specrunner guide` (#1008) を正本化した直後の状態で、以下の誤案内・不整合が存在する:

**実行エラーになる誤案内**
- `guide.ts:313` — `job cancel <slug>` を案内するが CLI 契約は `job cancel <jobId>`。VALID_JOB_ID_CHARS `/^[a-f0-9-]+$/` が slug を即 reject する
- `guide.ts:112` — worktree path を `<slug>-<jobId>` と案内するが実態は `<slug>-<jobId先頭8文字>`

**正典モデルと逆の記述**
- `guide.ts:377-378` (review topic): "request.md でなく起点 issue の正典を canon とする"
- `guide.ts:184` (audit topic): "レビューは request.md ではなく起点 issue の正典と照合する"
- #959 確定済みモデル: pipeline 開始前に fidelity gate 完結 → pipeline 開始後の規範は request.md

**既存テストを素通りした理由**
- guide.test.ts TC-013 は inline backtick 抽出のみ。triple-backtick コードブロック内の `job cancel <slug>` を検出できない
- path 解決のみチェック。flag 実在・positional 名一致は未検証

**その他の不整合**
- `runner.ts:450-451` — halt 出力に `specrunner guide escalation` 導線なし
- `guide.ts:42` — `#981` merge 後に不要となった "state 登録ラグ / job ls で確認" 手順が残存
- `guide.ts:199` — init 見出しが "2 層 config scaffold" だが project-local scaffold は生成しない
- `.claude/skills/acceptance-and-issue-audit/SKILL.md:6` — 削除済み `parallel-request-workflow` への言及
- `specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md:49` — "tombstone を置いて実質削除" だが実態は directory 削除

## Goals / Non-Goals

**Goals**:
- guide.ts の誤案内 3 件 + 不整合 3 件を修正する
- runner.ts halt 出力に guide 導線を追加する
- guide コマンド例の invocation contract 検証を triple-backtick + flag + positional まで拡張し同種の誤案内を CI で捕捉する
- SKILL.md の dead reference と ADR の実状態不一致を除去する

**Non-Goals**:
- `job cancel` CLI の slug 受理拡張
- `job show` への Worktree パス表示追加
- guide topic 構成・registry 構造の変更
- docs / README 再構成

## Decisions

### D1: guide.ts の修正内容

**review topic (lines 377-378)**
"起点 issue の正典を canon とする" 記述を削除し次のモデルに置き換える:
- pipeline 開始後の規範は request.md / spec
- issue との比較は転記監査 (audit topic) の 1 観点であり、review では行わない

**audit topic (line 184)**
"レビューは request.md ではなく起点 issue の正典と照合する" を削除。audit の AC 突合せ軸は request.md を規範とし、issue との比較は転記監査観点 (request.md 作成時の要件弱体化の確認) として位置づける。

**escalation topic (line 313)**
`specrunner job cancel <slug> --restore-draft` を 2 段案内に置き換える:
1. `specrunner job show <slug>` で Job ID を確認
2. `specrunner job cancel <jobId> --restore-draft` を実行

CLI 契約 `job cancel args: [{name: "jobId"}]` (command-registry.ts:929) に整合する。guide 側で修正し CLI の入力ドメインは拡張しない (architect 確定)。

**merge topic (line 112)**
`<slug>-<jobId>` → `<slug>-<jobIdの先頭8文字>` に修正。`manager.ts:65` の `jobId.slice(0, 8)` と一致させる。表記修正に留め job show への Worktree 表示追加はスコープ外 (architect 確定)。

**jobs topic (line 42)**
"起動直後は state 登録に数秒ラグあり。`job ls` で running を確認してから:" を削除し、detach の ack (親 exit 0 = 登録完了 + プロセス生存) を前提とした案内にする。

**setup topic (line 199)**
見出し "init — 2 層 config scaffold" → "init — global config + repository scaffold" に修正。`runInit` (init.ts:143-165) は user-global config と per-repo scaffold のみ生成し、project-local `.specrunner/config.json` は scaffold しない。

*Alternatives considered*: 見出しのみ直す vs 本文も更新。両方必要 (見出しが誤りで本文は正確だが見出しと本文の整合が求められる)。

### D2: runner.ts halt 出力への導線追加

`runner.ts:451` の `logInfo("Run 'specrunner resume' to continue...")` の次行に `logInfo("詳細: specrunner guide escalation")` を追加する。

*Rationale*: resumePoint.reason 側 (各 producer) に追加すると複数 producer に漏れが発生しやすく、halt 時に必ず通る出力面 1 箇所に足す方が安全 (architect 確定)。escalation.ts:29 / canon-escalation.ts:151 の既存文面 `詳細: \`specrunner guide escalation\`` と揃える。

*Alternatives considered*: resume コマンドの出力に追加 → resume 経路でしか出ない。cancel case では出ない。棄却。

### D3: invocation contract の拡張

**対象範囲の拡張**
現行 TC-013 の `extractSpecrunnerCommands` (inline backtick のみ) に加え、triple-backtick コードブロック内の `specrunner ...` 行を新規関数で抽出する。

**パーサー仕様 (コードブロック行)**
1. コードブロック行の先頭 `specrunner ` をストリップ
2. 行末 `# comment` をストリップ
3. 行に `[` が存在する位置で打ち切り (optional block 内の要素を不問)
4. スペース区切りでトークン化
5. 先頭から連続する `[a-z][a-z0-9-]*` → path tokens
6. `--flag` → flag 名として記録; 直後トークンが `<...>` なら flag value placeholder として skip
7. `<name>` → positional placeholder として記録 (path 確定後、flag value でない場合)

**バリデーション 3 軸**
- (a) `resolveCommand(pathTokens).status === "ok"` — command path 実在
- (b) 各 flag 名が `spec.flags` に存在すること
- (c) i 番目 positional placeholder 名が `spec.args[i].name.split(/[| ]/)` のいずれかに一致すること

*Rationale for (c)*: `job show` の `args.name = "jobId|slug"` は `|` 区切り複合宣言。`rules new` の `args.name = "step-name rule-slug"` は space 区切り複合宣言 (count: 2)。いずれも `/[| ]/` で split すれば個別 placeholder 名と一致する。`job cancel` の `args.name = "jobId"` に対して `<slug>` は不一致 → fail が目的の挙動。CommandSpec が CLI interface の正本 (architect 確定)。

**除外リスト (INVOCATION_CONTRACT_SKIP_PATTERNS)**
テストコード内の named constant として管理。各エントリは `{ pattern: RegExp; reason: string }` を持つ。silent skip 禁止。

| pattern | reason |
|---------|--------|
| `/[│$>]/` | shell metacharacter (redirect / pipe / variable) — standalone invocation でない |

これにより `specrunner job wait <slug> >/dev/null 2>&1` と `specrunner request template > ...` が除外される。

*Alternatives considered*: per-line 除外リスト → pattern-based より保守コストが高い。pattern で十分にカバーできる。

### D4: ネガティブテスト

`parseInvocation` と positional validation ロジックを、guide 本文からではなく、テスト内の文字列定数 `"specrunner job cancel <slug> --restore-draft"` で直接テストする独立 describe block を追加する。validation が positional 名不一致 violation を返すことを confirm する。

*Rationale*: guide 本文が修正された後も "validator は不一致を捕捉できる" という検証ロジック自体の正しさをピン留めする。

### D5: SKILL.md の修正

`acceptance-and-issue-audit/SKILL.md` の description frontmatter の `parallel-request-workflow / rebase-finish の前後どちらでも` から `parallel-request-workflow / ` を除去する。本文は変更しない (TC-011 が引き続き green を維持)。

### D6: ADR の修正

`specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md` の `parallel-request-workflow` 削除に関する記述を、実状態 (directory ごと削除済み、tombstone なし) に合わせて修正する。

## Risks / Trade-offs

**[Risk] TC-021 が escalation body の `job cancel` + `--restore-draft` を pin している**
Mitigation: 修正後も body はこれらを含む (引数 `<jobId>` に変わるのみ)。TC-021 は変更不要で green を維持する。

**[Risk] `[--issue <n>]` の optional block 内の `<n>` を誤検証する**
Mitigation: D3 の仕様で `[` 位置で行を打ち切るため `<n>` は解析対象外。

**[Risk] `job start <slug|file>` の placeholder が args.name `"slug|file"` と一致しない**
Mitigation: `<slug|file>` を含む行は INVOCATION_CONTRACT_SKIP_PATTERNS の `/[|$>]/` にマッチして除外される。バリデーション対象にならないため問題なし。

**[Risk] setup topic の init 見出し旧文言を pin するテストがある場合に壊れる**
Mitigation: 既存 guide.test.ts に setup init 見出しの文字列 pin はない。影響なし。

## Open Questions

なし。設計判断は request.md の architect 評価済み決定で全て確定済み。
