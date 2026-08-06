# issue 起点 run の開始前忠実性ゲート — 黙って弱められた request で pipeline が走ることを封じる

## Meta

- **type**: new-feature
- **slug**: issue-request-fidelity-gate
- **base-branch**: main
- **adr**: true
- **issue**: 875

## 背景

issue を起点に request.md を作成する際、issue 本文の要件が request で黙って弱められると、以後の spec-review / test-case-gen / implementation / code-review / conformance まで、すべての gate が弱められた request を正典として検証し、高スコアで approve に到達する。issue と request の要件差分を検査する歯がどこにも無い（実例: Issue #860 → PR #872。「fixture project へ install」「subdirectory から実行」等の明記要件が request 化で落とされ、pipeline は 9.05 点で approve、人間の独立照合で初めて発覚した）。

対応方針は issue #875 の再定義（2026-07-20）で確定済みであり、本 request はそれに従う:

1. **開始前完結**: issue との突き合わせは pipeline 開始前に完結する。request が正典として確定してから pipeline が開始される
2. **非伝播**: issue 本文を pipeline の agent へ文脈として持ち込まない（role-scoped context の原則。正典の多重化を招くため）
3. **差分ゼロは求めない**: 本質は「落とした要件の明示」= スコープ外宣言の強制。無言の弱体化だけを塞ぐ

なお #875 のうち本 request が受け持つのは「転記漏れを開始前に確定させる」部分のみであり、request → 派生成果物の忠実性（hash / revision 束縛）は別課題である（#875 自身がそう切り分けている）。

## 現状コードの前提

- `run --issue <n>` は issue を fetch しない。issue 番号は state に保存され（`src/core/command/pipeline-run.ts:155-157`）、終端通知にのみ使われる（`src/core/notify/issue-notifier.ts:230-251`）
- issue 本文はどの agent prompt にも注入されていない（`src/prompts/` / `src/core/step/` に issue 本文の参照なし）
- GitHub client port に単一 issue 取得メソッドが無い（`src/kernel/github-client.ts`。adapter `src/adapter/github/github-client.ts` は `/issues/{n}/comments` と labels 操作のみ）。run 経路では preflight が token を解決し client を構築済み（`src/cli/run.ts:82`、`src/core/preflight.ts:61-79`）
- `request validate` は完全 offline の決定的コマンド（`src/core/command/request.ts:126-177`）。入口コマンドの決定性（LLM 到達境界を job 実行経路に閉じる）は canon 化済み（#939 / `specrunner/adr/2026-07-31-deterministic-request-entrance.md`）
- inbox 経路は issue 本文がそのまま request.md になるため（`src/core/inbox/run-inbox.ts:397-400`）、転記による乖離が構造的に生じない
- pipeline の最初の step は request-review（`src/core/command/pipeline-run.ts:165`）。request.md の自己完結性・根拠を検証するが issue との照合はしない（`src/prompts/request-review-system.ts`）
- request.md の Meta には optional の issue field が既にある（`src/parser/request-md.ts:117-126`）

## 要件

1. **開始前忠実性ゲート**: `--issue <n>` を指定した run / job start で、pipeline の最初の step（request-review）が走る前に、issue 本文と request.md を照合する entrance gate を実行する。gate は job 実行経路内に置く（LLM 使用可 — #939 の境界に整合。`request validate` 等の入口コマンドには LLM / network を導入しない）
2. **判定規則**: issue に明記された要件のうち、request の要件にも「スコープ外」宣言にも現れないもの（undeclared drop）を列挙する。1 件以上あれば halt し、列挙を提示する。スコープ外として明示宣言された要件は drop とみなさない。差分ゼロ・文言一致は要求しない
3. **halt の形**: gate は job bootstrap 後・最初の step 前に走り、halt は escalation として記録される。operator は request.md を修正（要件の復元またはスコープ外宣言の追記）して resume できる。pipeline step は一つも実行されない
4. **非伝播の保証**: 照合に使った issue 本文を job state / change folder / いかなる step の入力にも保存・注入しない。記録するのは gate の結果（pass の事実、halt 時の undeclared drop 列挙）のみ
5. **getIssue port の追加**: GitHub client port に単一 issue 取得（`GET /repos/{owner}/{repo}/issues/{number}`、title と body を返す）を追加する
6. **縮退規律は fail-closed**: issue fetch 失敗（network / 権限 / 404）で gate を通過扱いにしない（halt）。明示的な operator override を設ける場合は可視な flag によるものとし、暗黙 skip は設けない。`--issue` を指定しない run には gate も fetch も一切発生しない
7. **inbox 経路は明示 skip**: issue 本文 == request.md の inbox 経路では gate を skip し、skip の事実と理由を log に残す

## スコープ外

- `request validate` への network / LLM 導入（入口決定性 canon の維持）
- request → 派生成果物（spec / tasks / test-cases / 実装）の忠実性検査・hash / revision 束縛（#875 の切り分けどおり別課題）
- 凍結 TC の上書き宣言（supersedes）機構
- issue 本文の品質・構造の検査（issue 側の書き方は対象外）

## 受け入れ基準

- [ ] 照合結果が undeclared drop を 1 件以上報告した場合、pipeline step が一つも実行されず escalation で halt することをテストで固定する（照合はテストダブルで駆動）。破壊確認込み
- [ ] undeclared drop ゼロ（要件充足またはスコープ外宣言済み）の場合、gate を通過し request-review から通常どおり開始することをテストで固定する
- [ ] 照合 prompt の contract（issue 要件の列挙・スコープ外宣言の尊重・差分ゼロ非要求）の文言存在をテストで固定する（prompt contract テストの様式）
- [ ] issue 本文が change folder / job state / step prompt 構築のいずれにも現れないことをテストで固定する
- [ ] `--issue` なしの run で gate も issue fetch も実行されないことをテストで固定する
- [ ] inbox 経路で gate が skip され、skip 理由が log に残ることをテストで固定する
- [ ] issue fetch 失敗が pass 扱いにならない（halt する）ことをテストで固定する
- [ ] `getIssue` の adapter 実装（endpoint / 認証 header / エラー変換）をテストで固定する
- [ ] halt 後に request.md を修正して resume すると gate が再評価されることをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: run 経路内・最初の step 前の entrance gate** — #875 再定義の「開始前完結」と #939 の「LLM 到達境界は job 実行経路」を同時に満たす唯一の位置。validate に置くと入口決定性 canon に反し、request-review に置くと issue 本文が pipeline step の文脈に入る
- **採用: fail-closed** — fetch 失敗の pass 扱いは「issue 連携時だけ歯が抜ける」fail-open であり、gate の存在意義を失う
- **却下: request-review step が issue 本文を入力に取る案** — #875 再定義が明示的に却下済み（role-scoped context 違反・正典多重化）
- **却下: `request validate --against-issue <n>`** — validate への network / LLM 導入は #939 の入口決定性 canon に反する
- **却下: request.md への「issue 要件対応表」記載の強制のみ（照合なし）** — 対応表の網羅性を issue と照合する者が居なければ、黙って表から落とすだけで素通りする。歯にならない
- **却下: inbox 経路への gate 適用** — inbox は issue 本文がそのまま request.md であり乖離が構造的に生じない。無条件適用は無意味な fetch と失敗面を増やすだけ
