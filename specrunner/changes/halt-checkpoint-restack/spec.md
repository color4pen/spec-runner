# Spec: halt checkpoint を未 push 作業 commit から分離して publish する

## Requirements

### Requirement: halt checkpoint の push が失敗したとき、最終 publish 済み tip を親として checkpoint を積み直して publish する

terminal 遷移後の checkpoint / finalize commit の push が retry を含めて失敗した場合、システムは
最後に push が成功している remote tip（`origin/<branch>`）を親とする checkpoint commit を新たに作り、
それを `origin/<branch>` へ push SHALL する（同じく 1 retry）。積み直された commit は
ローカル branch tip に存在する未 push commit を親系列に一切含んではならない（MUST NOT）。

`origin/<branch>` が解決できない場合（1 度も publish されていない branch）は積み直しを行わず、
既存どおり warn のみで継続 SHALL する。

#### Scenario: 作業 commit の push が拒否される状況で halt した

**Given** branch tip に remote が受理しない作業 commit（例: `.github/workflows/` を変更する commit）があり、
その上に `awaiting-resume` の halt checkpoint commit が積まれている
**And** `origin/<branch>` は作業 commit より前の commit を指している
**When** pipeline が halt して checkpoint の push が retry 込みで拒否される
**Then** `origin/<branch>` の tip が新たに積み直された checkpoint commit へ進む
**And** その commit の親は積み直し前の `origin/<branch>` tip と一致する
**And** その commit から到達できる commit 集合に未 push の作業 commit は含まれない
**And** その commit の state.json の `status` は `awaiting-resume` である

#### Scenario: publish 済み tip が存在しない branch では積み直しをしない

**Given** `origin/<branch>` が存在しない（branch が 1 度も push 成功していない）
**When** halt checkpoint の push が retry 込みで失敗する
**Then** 積み直し commit は作られず push も行われない
**And** 呼び出しは例外を投げずに完了する

### Requirement: 積み直した checkpoint の tree は change folder のみを差し替え、それ以外を publish しない

積み直した commit の tree は、親（最終 publish 済み tip）の tree に対して
`specrunner/changes/<slug>/` 配下だけをローカル checkpoint commit の内容へ差し替えたものと
SHALL する。push 前にシステムは親と積み直し commit の差分パスを検査し、
`specrunner/changes/<slug>/` 配下以外のパスが 1 つでも含まれる場合は push してはならない（MUST NOT）。
差分が空の場合も push しない。

#### Scenario: 未 push 作業 commit のファイル変更は publish されない

**Given** 未 push の作業 commit が `.github/workflows/ci.yml` と `src/` 配下を変更している
**When** halt checkpoint が積み直されて publish される
**Then** 積み直し commit と親 commit の差分パスはすべて `specrunner/changes/<slug>/` 配下である
**And** `origin/<branch>` の tree の `.github/workflows/ci.yml` は親 commit の内容のままである

#### Scenario: change folder 外の差分が検出された場合は push しない

**Given** 積み直し commit と親 commit の差分に `specrunner/changes/<slug>/` 配下以外のパスが含まれる
**When** 封じ込め検査が実行される
**Then** 積み直し commit は push されない
**And** 警告が stderr に出力され、呼び出しは例外を投げずに完了する

### Requirement: 積み直された checkpoint は attach 検証を通過し、拒否された step から resume できる

積み直された checkpoint commit は、generic integrity（journal / projection 整合、counter reversal、
profile）・`attachQuiescentPolicy`・identity（repository / jobId / branch / slug）のすべてを
満たす self-consistent な内容で SHALL ある。local state を持たない環境が
`origin/<branch>` を attach したとき、halt した step から resume 可能な状態で
再束縛できなければならない（MUST）。

#### Scenario: local state を持たない環境から attach 検証が成立する

**Given** 積み直された checkpoint が `origin/<branch>` の tip として publish されている
**And** 検証を行う環境は当該 job の local state（sidecar / worktree）を一切持たない
**When** attach の検証（fetch → checkpoint 読み出し → `attachQuiescentPolicy` による検証）を実行する
**Then** 検証は成功し、verified checkpoint の `checkpointOid` が積み直し commit の OID と一致する
**And** 検証済み state の `status` は `awaiting-resume` で、resume step は halt した step に解決される

#### Scenario: journal が state.json の counters を巻き戻していない

**Given** 積み直された checkpoint の events.jsonl には積み直し記録が 1 行追記されている
**When** attach の counter reversal 検査が state.json の `_journal` counters と journal の fold 結果を比較する
**Then** counter reversal は検出されず、検証は成功する

### Requirement: 積み直しの発生を journal event として publish される checkpoint に記録する

システムは積み直しを実施する際、`checkpoint-restack` 種別の journal-only record を events.jsonl へ
append SHALL し、その record が publish される checkpoint の tree に含まれるようにしなければならない
（MUST）。record は親 commit OID、push を拒否された local tip OID、publish されなかった commit の
OID 列、および push 失敗理由（センシティブ情報は伏字化して截断した文字列）を含む SHALL。
この record は state.json の projection（history / steps / counters）を
変更してはならない（MUST NOT）。

#### Scenario: publish された checkpoint から未 publish commit を判別できる

**Given** 未 push の作業 commit が 1 件以上ある状態で halt checkpoint が積み直されて publish された
**When** publish された checkpoint の events.jsonl を読む
**Then** `checkpoint-restack` record が 1 件含まれる
**And** その record の親 OID は積み直し commit の親と一致する
**And** その record の未 publish commit OID 列に、push されなかった作業 commit の OID が含まれる

#### Scenario: 積み直し record は projection を増やさない

**Given** events.jsonl に `checkpoint-restack` record が含まれる
**When** journal を fold して state を合成する
**Then** history の件数と step ごとの件数は record 追加前と変わらない

### Requirement: 積み直しの失敗は例外を投げず警告のみで継続する

積み直しに関わるいずれの操作（remote tip 解決、tree 構築、封じ込め検査、push、台帳追記、
journal 追記、local branch の再接続）が失敗しても、システムは例外を投げてはならず（MUST NOT）、
stderr への警告のみで継続 SHALL する。local からの resume 可能性を損なってはならない（MUST NOT）。

#### Scenario: 積み直した checkpoint の push も拒否される

**Given** remote がこの branch へのすべての push を拒否する
**When** halt checkpoint の push が失敗し、積み直しの push も retry 込みで失敗する
**Then** 呼び出しは例外を投げずに完了する
**And** 積み直しが publish されなかったことを示す警告が stderr に出力される
**And** ローカルの branch tip は元の checkpoint commit のままで、作業 commit も失われない

#### Scenario: journal 追記が失敗しても publish を試みる

**Given** `checkpoint-restack` record の追記が失敗する
**When** 積み直し処理が続行される
**Then** 例外は投げられず、積み直し commit の作成と push が引き続き試みられる

### Requirement: 積み直した checkpoint を publish したあと、ローカル branch を publish 済み commit の子孫にする

積み直しの push が成功し、かつ HEAD が対象 branch を指している場合、システムはローカル branch を
publish 済み commit の子孫と SHALL する（tree はローカル HEAD のものを保持する）。この操作は
既存の commit を破棄・書き換えてはならず（MUST NOT）、worktree の内容を変更してはならない（MUST NOT）。
生成した commit の OID は `synthesizedCommits` 台帳へ追記 SHALL する。

#### Scenario: 積み直し後もローカル branch から fast-forward で push できる状態になる

**Given** 積み直した checkpoint が `origin/<branch>` へ publish された
**And** HEAD はそのローカル branch を指している
**When** 再接続処理が実行される
**Then** publish された commit はローカル branch tip の祖先である
**And** ローカル branch tip の tree は再接続前のローカル HEAD の tree と同一である
**And** 未 push の作業 commit はローカル branch から引き続き到達できる

#### Scenario: HEAD が detached の場合は再接続しない

**Given** HEAD が branch を指していない（detached HEAD）
**When** 積み直しの push が成功する
**Then** ローカルの branch ref は変更されない
**And** 呼び出しは例外を投げずに完了する

### Requirement: push が成功する通常経路の挙動は変更しない

checkpoint / finalize commit の push が成功した場合、システムは積み直しに関するいかなる git 操作も
実行してはならず（MUST NOT）、journal への `checkpoint-restack` record 追記も行ってはならない（MUST NOT）。

#### Scenario: push 成功時に追加の git 操作が発生しない

**Given** halt checkpoint の push が 1 回目で成功する
**When** checkpoint publish 処理が完了する
**Then** fetch / ls-tree / commit-tree / update-ref といった積み直し用の git 操作は 1 度も呼ばれない
**And** events.jsonl に `checkpoint-restack` record は追記されない
