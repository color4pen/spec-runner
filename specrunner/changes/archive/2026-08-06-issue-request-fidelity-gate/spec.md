# Spec: issue 起点 run の開始前忠実性ゲート

## Requirements

### Requirement: entrance gate は最初の pipeline step より前に issue と request.md を照合する

`--issue <n>` を伴う run / resume で、`jobState.issueNumber` が設定されており、`jobState.inboxOrigin` が真でなく、
かつ開始 step が request-review（entrance）であるとき、システムは pipeline の最初の step を実行する**前**に、
issue 本文と change folder の request.md を照合しなければならない（MUST）。照合は job 実行経路内で行う（LLM 使用可）。

#### Scenario: issue 連携 run の entrance で gate が動く

**Given** `--issue 875` を伴う run で、開始 step が request-review、`inboxOrigin` が未設定
**When** `CommandRunner.execute()` が `pipeline.run` を呼ぶ直前に到達する
**Then** gate が issue #875 を fetch し、request.md と照合する
**Then** 照合が pipeline の最初の step より前に完了する

---

### Requirement: undeclared drop が 1 件以上あれば pipeline step を一つも実行せず escalation で halt する

照合結果が undeclared drop（issue に明記された要件のうち request の「要件」にも「スコープ外」宣言にも現れないもの）を
1 件以上報告した場合、システムは pipeline step を一つも実行してはならず（MUST NOT）、job を awaiting-resume へ遷移させ
escalation として halt しなければならない（MUST）。halt state は undeclared drop の列挙を含み、issue 本文は含めてはならない（MUST NOT）。
スコープ外として明示宣言された要件は drop とみなしてはならない（MUST NOT）。差分ゼロ・文言一致は要求しない。

#### Scenario: undeclared drop あり → 全 step 未実行で halt

**Given** 照合（test double）が undeclared drop を 1 件以上返す
**When** entrance gate が評価される
**Then** `pipeline.run` は呼ばれず、request-review 以降の pipeline step が一つも実行されない
**Then** job は awaiting-resume になり、error.code は `ISSUE_FIDELITY_UNDECLARED_DROP`
**Then** halt の reason / error は落とされた要件を列挙し、issue 本文は含まない

#### Scenario: スコープ外宣言済みは drop でない

**Given** issue の要件のうち request の「スコープ外」宣言に現れる要件がある
**When** 照合がその要件を評価する
**Then** その要件は undeclared drop に含まれない

---

### Requirement: undeclared drop ゼロなら gate を通過し request-review から通常開始する

照合結果の undeclared drop が 0 件（要件充足またはスコープ外宣言済み）の場合、システムは gate を通過し、
`pipeline.run` を request-review から通常どおり開始しなければならない（MUST）。gate 通過の事実のみを記録し、
issue 本文を記録してはならない（MUST NOT）。

#### Scenario: undeclared drop ゼロ → 通常開始

**Given** 照合（test double）が空の undeclared drop を返す
**When** entrance gate が評価される
**Then** gate は pass し、`pipeline.run(request-review)` が通常どおり呼ばれる
**Then** job state / change folder に issue 本文が現れない

---

### Requirement: 照合に使った issue 本文を state / change folder / step prompt に保存・注入しない

システムは、照合に使った issue 本文を job state・change folder・いかなる pipeline step の prompt 構築の入力にも
保存または注入してはならない（MUST NOT）。記録するのは gate の結果（pass の事実、halt 時の undeclared drop 列挙）のみとする（MUST）。

#### Scenario: gate 通過後に issue 本文が残らない

**Given** 既知の sentinel 文字列を含む issue 本文で gate が pass する
**When** gate が完了する
**Then** sentinel は永続化された job state に現れない
**Then** sentinel は change folder のいずれのファイルにも現れない
**Then** sentinel は pipeline step の prompt 構築（step-context-builder / 各 step の初期メッセージ）に現れない

---

### Requirement: `--issue` を指定しない run では gate も issue fetch も実行されない

`jobState.issueNumber` が未設定（`--issue` 未指定）の run では、システムは entrance gate も issue fetch も一切
実行してはならない（MUST NOT）。

#### Scenario: 未連携 run では gate 不発火

**Given** `--issue` を指定しない run（`jobState.issueNumber` が null）
**When** `CommandRunner.execute()` が entrance gate の位置に到達する
**Then** `getIssue` は呼ばれず、照合も行われない
**Then** `pipeline.run(request-review)` が通常どおり呼ばれる

---

### Requirement: inbox 経路では gate を skip し、skip 理由を log に残す

`jobState.inboxOrigin` が真（issue 本文 == request.md の inbox 経路）のとき、システムは entrance gate を skip し
（MUST）、fetch を行ってはならず（MUST NOT）、skip の事実と理由を log に残さなければならない（MUST）。

#### Scenario: inbox job は gate skip

**Given** `inboxOrigin` が真かつ `issueNumber` が設定された job
**When** entrance gate の位置に到達する
**Then** `getIssue` は呼ばれず、照合も行われない
**Then** skip の事実と理由が log に残る
**Then** `pipeline.run(request-review)` が通常どおり呼ばれる

---

### Requirement: issue fetch 失敗は pass 扱いにならず halt する（fail-closed）

entrance gate が applicable なとき、issue fetch が失敗（network / 権限 / 404 / 5xx）した場合、システムはこれを
gate 通過扱いにしてはならず（MUST NOT）、awaiting-resume へ halt しなければならない（MUST）。暗黙 skip は設けない。

#### Scenario: fetch 失敗 → halt

**Given** `getIssue` が例外を throw する（例: 404 / 権限エラー）
**When** entrance gate が評価される
**Then** gate は pass せず、job は awaiting-resume になる
**Then** error.code は `ISSUE_FETCH_FAILED`
**Then** pipeline step は一つも実行されない

---

### Requirement: getIssue は単一 issue の title / body を返す

`GitHubClient` は `getIssue(owner, repo, issueNumber)` を提供し、`GET /repos/{owner}/{repo}/issues/{number}` を
Authorization / Accept / X-GitHub-Api-Version header 付きで呼び、200 応答の title と body（null は空文字）を返さなければ
ならない（MUST）。401 は `GITHUB_TOKEN_EXPIRED`、非 200（404 含む）は `GITHUB_API_ERROR` に変換しなければならない（MUST）。

#### Scenario: 200 応答の射影

**Given** issue が存在する
**When** `getIssue(owner, repo, n)` を呼ぶ
**Then** endpoint は `/repos/{owner}/{repo}/issues/{n}`、認証 header が付与される
**Then** 返り値は `{ number, title, body }`（body が null なら空文字）

#### Scenario: 非 200 はエラーに変換

**Given** issue endpoint が 404 を返す
**When** `getIssue(owner, repo, n)` を呼ぶ
**Then** `GITHUB_API_ERROR` が throw される（null を返さない）

---

### Requirement: halt 後に request.md を修正して resume すると gate が再評価される

entrance gate の halt により awaiting-resume になった job を、operator が request.md を修正して resume した場合、
システムは開始 step を request-review に戻し、entrance gate を**再評価**しなければならない（MUST）。再評価が undeclared
drop ゼロなら gate を通過し pipeline を開始する。

#### Scenario: 修正後 resume で再評価 → 通過

**Given** gate halt により awaiting-resume（resumePoint.step = request-review）になった issue 連携 job
**When** operator が request.md を修正し resume する（開始 step は request-review に解決される）
**Then** entrance gate が再度評価される
**Then** 照合（test double）が undeclared drop ゼロを返すと gate は pass し `pipeline.run(request-review)` が呼ばれる

---

### Requirement: 照合 prompt は要件列挙・スコープ外尊重・差分ゼロ非要求の contract を持つ

実 comparator が使う照合 prompt は、(a) issue の要件を列挙する指示、(b) request の「要件」と「スコープ外」宣言の両方を
参照しいずれにも現れない要件のみを undeclared drop とする指示、(c) 差分ゼロ・文言一致を要求しない旨、を含まなければ
ならない（MUST）。

#### Scenario: prompt contract の文言が存在する

**Given** 照合 prompt の system / user builder
**When** prompt 文字列を検査する
**Then** issue 要件の列挙を指示する文言が存在する
**Then** スコープ外宣言を drop とみなさない旨の文言が存在する
**Then** 差分ゼロ・文言一致を要求しない旨の文言が存在する
