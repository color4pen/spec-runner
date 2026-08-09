# ADR-20260809: regression-gate を新規退行の検出に限定し low/medium 偽ループを解消する

## ステータス

accepted

## コンテキスト

custom reviewer を持つ job では、code-review / custom reviewer の収束後に `regression-gate` が走り、
レビュー中に指摘された fixable findings（findings ledger）が最終コードにも残っているかを台帳照合する。

直近 12 job の実測（issue #952）で regression-gate の `needs-fix` 判定 5 件すべてが偽であり、
新規に検出された退行は 0 件であることが判明した。成功確率ゼロの再検証（最大 3 周）が
イテレーション予算を毎回使い切っていた。

原因は 3 箇所の相互矛盾:

1. **routing 層**: severity 不問で fixable な finding を code-fixer に渡す
   （`collectFixableFindings`、`resolution === "fixable"` のみ抽出、severity 不問）。
2. **code-fixer prompt**: 受け取った入力を「`Ignore LOW severity findings`」と severity で再フィルタして捨てる
   （prompt 全 5 変種に記述。「渡してから無視させる」二重フィルタ）。
3. **regression-gate 判定**: ledger が未修正 finding を severity・修正実績不問で全件保持し、
   `findings.some(f => f.resolution === "fixable")` で `needs-fix` を誘発する（severity・既知性不問）。

加えて `regression-gate` の system prompt は ledger を「code-fixer が修正した fixable findings の完全リスト」
と説明していたが、実装は「reviewer が指摘した fixable findings 全件（修正済みとは限らない）」を渡しており、
記述が虚偽だった。

コード上の事実（実測確認済み）:

- `reviewer-chain.ts:165-186` — reviewer `approved` かつ fixable findings ありのとき
  `code-fixer → next` の one-shot 前進経路が機能する。`approved` 到達時点では
  critical/high は `needs-fix`、`decision-needed` は escalation に落ちているため、
  この経路で routing される fixable は実質 low/medium。
- `findings-ledger.ts:35,131` — reviewer の fixable finding を severity・修正実績不問で全件収集。
  未修正 low もここに残る。
- `judge-verdict.ts:210-224` `deriveRegressionGateVerdict` — gate agent は退行を
  severity=`high` / resolution=`fixable` で報告し、未修正 low も同一の needs-fix 規則を誘発する。

fingerprint（既知性判定）の既存機構: `dedupeFindings` の dedupe key
`${f.file}|${f.line ?? ""}|${f.title}`（`findings-ledger.ts:170`）。

## 決定

### D1: 既知未修正の除外は gate の判定層で fingerprint 照合により行う

gate の入力 ledger は全件のまま維持し、gate agent は従来通り全 ledger エントリを検証してよい。
除外は **verdict 導出直前の入力整形**で行う:

- **既知未修正集合** = gate ledger のうち routing 層の severity policy で code-fixer に
  routing されない finding = **severity `low` の ledger エントリ**（ledger は既に fixable のみ）。
- gate agent が報告した findings のうち、fingerprint が既知未修正集合に一致するものを
  verdict 導出の入力から落とす。残った findings に従来の `deriveRegressionGateVerdict` を適用する。
- fingerprint は `dedupeFindings` と同一キー `${file}|${line}|${title}` を流用する。
  gate agent は退行を ledger の元 file/line/title で報告するため照合が成立する。

**配置**: `deriveStepCompletion`（`step-completion.ts`）の isJudgeStep 分岐で、
`step.name === REGRESSION_GATE_STEP_NAME` のときのみ `verdictFn` 呼び出し前に findings を整形する。
既知未修正集合の算出と除外は純関数 `excludeKnownUnfixedRegressions` として
`findings-ledger.ts` に置き、単体テスト可能にする。
`deriveRegressionGateVerdict` のシグネチャ・実装は変更しない。

**import cycle 回避**: `findings-ledger.ts` が `reviewer-chain.ts` を import すると
`findings-ledger.ts` → `reviewer-chain.ts` → `regression-gate.ts` → `findings-ledger.ts` の
間接循環が成立する。`computeRegressionLedger` は `reviewerChain: string[]` を引数で受け取り、
`deriveImplReviewerChain(state)` を内部で呼ばない。呼び出し元 `step-completion.ts` が
`deriveImplReviewerChain(state)` を実行して渡す。

**却下案**:

- `deriveRegressionGateVerdict` のシグネチャに既知未修正集合を追加（「判定自体」案） —
  `judgeVerdictFn` の 4 引数契約（`step-types.ts`）を全 judge step で拡張することになり、
  executor の generic 呼び出しに state 依存の第 5 引数を通す必要がある。
  入力整形案の方が影響が局所的で、`deriveRegressionGateVerdict` の契約と既存テストを保てる。不採用。
- gate の ledger 構築段（`regression-gate.ts` buildMessage）で low を除外して gate に渡す —
  「gate は従来通り全件を検証してよい」方針に反し、また「除外は verdict 導出直前」の配置から外れる。不採用。
- code-fixer 自己申告（「修正した一覧」）を ledger の根拠にする —
  agent 自己申告を検証なしに信頼することになり架空の「修正済み」が混入しうる。不採用。
- ledger を fixed-only に変える —
  修正済み判定を fixer 自己申告か diff 推測に依存させることになる。同上の理由で不採用。

### D2: LOW 除外を routing 層 1 箇所に集約し、code-fixer prompt の severity 再フィルタを撤去する

severity policy を単一関数 `selectFixerTargetFindings(findings)` として `judge-verdict.ts` に新設し、
「fixable かつ severity ≠ `"low"`」を LOW 除外の唯一の表現箇所とする。

適用範囲:

- `routed-findings.ts:113`（Branch 3、standard reviewer path）の code-fixer routing 抽出を
  `collectFixableFindings` から `selectFixerTargetFindings` に差し替える。
- `code-fixer.ts` の standard path（`buildMessage` 内、`getLatestJudgeFindings` 経由分岐）で
  code-fixer に見せる findings を `selectFixerTargetFindings` で絞る。
  「routing 対象集合 ＝ prompt 指示対象」が一致する。
- prompt 全 5 変種から `Ignore LOW severity findings` 行を削除する。
  残る `Fix all HIGH and CRITICAL ...` / `Fix MEDIUM ... only if they do not require design changes` は
  非 LOW findings への指示として引き続き有効。
- coordinator path（`collectParallelFixerFindings`）と conformance path（`getConformanceFixContext`）には
  severity 絞り込みを適用しない（`Ignore LOW` 行の削除のみ）。
  これらは `needs-fix` 判定（critical/high 必須）を経て routing されるため one-shot low 経路を持たず、
  仮に low が gate ledger に入っても D1 の既知未修正除外が backstop となりループしない。

D1 の既知未修正集合（ledger の low）は本 policy の裏返し（`severity === "low"`）であり、
同一 severity 述語を参照する。「routing で落とした LOW は ledger 側でも needs-fix 事由にならない」が
単一述語で保証される。

**却下案**:

- prompt の `Ignore LOW` 行だけ消し routing に絞りを入れない —
  prompt が全 findings を「修正せよ」と指示し LOW も修正対象になる。LOW を修正対象外とする要件に反する。不採用。
- routing も prompt も変えず gate 側のみで吸収する —
  「渡してから無視させる」二重フィルタが残存し、code-fixer に LOW を渡したまま動作の整合性が失われる。不採用。

### D3: ledger 説明を実装の実態に一致させる

- `regression-gate-system.ts` の ledger 説明「code-fixer が修正した fixable findings の完全リスト」を
  「reviewer が指摘した fixable findings 全件（修正済みとは限らない）」の実態に修正する。
- `regression-gate.ts` の `buildLedgerBlock` 冒頭文
  `"The following findings were fixed during this job. Verify each one is still fixed in the current code."` を、
  「reviewer が指摘した fixable findings。全てが修正済みとは限らない。各エントリが最終コードに残存しているか検証せよ」
  の実態表現に修正する。
- gate の Method（各 ledger エントリを検証し退行を報告する手順）自体は変えない。

**却下案**: 実装を「fixed-only ledger」に変えて現 prompt 記述を正にする —
修正済み判定を fixer 自己申告か diff 推測に依存させる（D1 の rejected alternatives と同一理由）。不採用。

## 検討した代替案

### A1: `deriveRegressionGateVerdict` のシグネチャに既知未修正集合を追加する（D1 の代替）

gate finding の除外を verdict 関数の引数として渡し、関数内で除外する案。

- **Pros**: 除外ロジックが verdict 関数内に完結し、step-completion.ts に整形コードが不要になる。
- **Cons**: `judgeVerdictFn` の 4 引数契約（`step-types.ts:307`）を全 judge step で拡張することになり、
  executor の generic 呼び出しに state 依存の第 5 引数を通す必要がある。
  既存の `judge-verdict.test.ts:170-204` も引数変更の影響を受ける。
- **Why not**: 影響範囲が全 judge step に広がる。D1 の入力整形案は `step.name === REGRESSION_GATE_STEP_NAME`
  の分岐のみに影響を閉じられ、`deriveRegressionGateVerdict` の既存契約とテストを無改変で保てる。

### A2: gate の ledger 構築段（`regression-gate.ts buildMessage`）で low を除外する（D1 の代替）

gate agent に渡す ledger から low エントリを事前に除いて、gate が最初から low を検証しない案。

- **Pros**: gate が受け取るデータが「修正対象のみ」に絞られ、gate agent の仕事が減る。
- **Cons**: architect の「gate は従来通り全件を検証してよい」方針に反する。
  また gate が low を一切見なくなると、low の退行（一度修正されたが再度壊れた）を検出できなくなる。
- **Why not**: 要件 4（既知未修正と同一でない fixable finding には needs-fix を返す）に違反する。
  除外は「既知未修正」の fingerprint 照合によるべきで、severity でブランケット除外するのは過剰。

### A3: code-fixer 自己申告を ledger の根拠にする（D1 の代替）

code-fixer が「修正した finding の一覧」を構造化報告し、gate はその一覧を「修正済み」の根拠として
使用する案。

- **Pros**: 「実際に修正された finding」と「未修正のまま残った finding」を区別できるため、
  gate の判定が概念的に正確になる。
- **Cons**: agent 自己申告を検証なしに信頼することになる。fixer が「修正した」と報告しても
  コードが実際に変わっていない可能性があり、ledger の根拠が虚偽になりうる。
  自己申告の検証機構を別途追加しない限り、偽の「修正済み」エントリが混入するリスクがある。
- **Why not**: architect が明示的に却下。「agent 自己申告を検証なしに信頼することになるため採らない」
  （request.md スコープ外より）。fingerprint 照合は自己申告に依存しないため安全性が上回る。

### A4: prompt の `Ignore LOW severity findings` 行のみ削除し routing は変えない（D2 の代替）

code-fixer に full findings を渡したまま prompt の明示的な除外指示を消す案。

- **Pros**: routing 層に手を入れずに済み、差分が最小になる（prompt テキスト変更のみ）。
- **Cons**: prompt から LOW 除外指示を消すと、code-fixer が LOW findings も「修正せよ」と解釈し、
  LOW も修正対象になる挙動変化が生じる。「LOW を修正対象外とする」要件 2 に反する。
- **Why not**: LOW を修正対象から外す意図を routing 層に集約するのが設計目的であり、
  prompt だけ変えると「routing は渡す・prompt では修正しない指示がない」状態になり整合性が失われる。

### A5: 実装を fixed-only ledger に変えて現 prompt 記述を正にする（D3 の代替）

ledger が「修正した findings の完全リスト」という現 prompt 記述を真にするため、
ledger 構築段で「実際に修正された finding のみ」に絞る案。

- **Pros**: system prompt の記述と実装が一致し、gate agent の理解が正確になる可能性がある。
- **Cons**: 「修正済み」の判定を code-fixer 自己申告か diff 推測に依存させる必要がある（A3 と同じ問題）。
  検証なしの自己申告を根拠にすると、ledger の精度が agent の誠実性に依存する。
- **Why not**: A3 と同じ理由で architect 却下。prompt 記述を実装の実態（reviewer が指摘した全件）に
  合わせる（D3）の方が、記述を真にするために実装の安全性を下げるより優先度が高い。

## 影響

### Positive

- regression-gate が本来の意味（**新規退行の検出**）に戻り、既知の未修正 low finding を繰り返し
  検証する偽ループが排除される。
  直近 12 job で `needs-fix` 5/5 が偽、真の退行 0 という実測が解消されることを見込む。
- `Ignore LOW severity findings` という二重フィルタが消え、routing 対象と prompt 対象が一致する。
  routing で code-fixer に渡した finding は prompt でも処理対象となる（整合性回復）。
- `excludeKnownUnfixedRegressions` / `computeRegressionLedger` / `selectFixerTargetFindings` は
  純関数として単体テスト可能になる。再現テスト・新規退行テスト・修正済み退行テストを固定。
- `deriveRegressionGateVerdict` のシグネチャは無改変のため、既存の関連単体テストはゼロ変更で green。

### Negative

- gate agent の退行報告が ledger の file/line/title を正確に転記しない場合、fingerprint が一致せず
  既知未修正 low が新規退行と誤判定され `needs-fix` になりうる。
  ただし誤判定の向きは fail-safe（gate が拾い過ぎる側）であり、退行の見逃しにはならない。
- MEDIUM finding でも「design change を要する」として code-fixer が修正を見送るケースは
  既知未修正集合（low のみ）に入らないため、残存ループが発生しうる。
  ただし issue #952 の実測（needs-fix 5/5 は全て low 偽ループ、medium-design-change 起因 0）から
  scope 内では十分。将来 medium も対象化する場合は severity 述語を拡張し既知未修正集合の定義も
  連動させる 1 箇所改修で済む。

### Known Debt

- **MEDIUM 残存ループ**: `Fix MEDIUM ... only if they do not require design changes` の agent 意味判断は
  機械フィルタに移せないため routing 層から除外できない。medium-design-change 起因の偽ループが
  将来顕在化した場合、D2 の `selectFixerTargetFindings` の severity 述語と D1 の既知未修正集合定義を
  同時拡張することで対応する（issue #812 でも追跡）。
- **approved + low-only reviewer でも code-fixer セッションが起動する**: transition（scope 外・不変）が
  依然 code-fixer を起動し、非 low target が空のため 1 セッションを消費する。ただし
  `findingsRoutingApproved` により no-op は escalation されず前進するため実害は軽微。
  根本解消は reviewer-chain の transition 条件再設計（#812）であり本変更の scope 外。

## 参照

- Request: `specrunner/changes/regression-gate-false-loop/request.md`
- Design: `specrunner/changes/regression-gate-false-loop/design.md`
- Issue: #952（直近 12 job での偽ループ実測）
- Related: #812（reviewer/fixer 収束ロジックの循環依存整理、scope 外）
- Related: #944（findings ledger の jobId キー化、scope 外）
