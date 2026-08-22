# Spec: Actions dispatch に archive を追加し、merge 後の head branch 削除に耐える

## Requirements

### Requirement: The dispatch workflow shall expose an archive action that delegates to the CLI

`SpecRunner Dispatch` workflow の `workflow_dispatch.inputs.action` は
`start` / `resume` に加えて `archive` を選択肢として提供 SHALL する。
`archive` が選択されたとき、workflow は `specrunner job archive --from-issue <issue>` を
呼び出すだけで、archive の相判定（record 作成か完了処理か）・PR merge 状態の判定・
job status の解釈を一切行っては MUST ならない。
`--with-merge` を渡しては MUST ならない。

#### Scenario: action choices contain archive

**Given** `.github/workflows/specrunner-dispatch.yml`
**When** `on.workflow_dispatch.inputs.action.options` の要素列を取り出す
**Then** その要素列は `start` / `resume` / `archive` を含む

#### Scenario: archive branch delegates to the CLI only

**Given** `Run pipeline` step の `run:` script
**When** `$ACTION` が `archive` のときに実行される分岐の本文を取り出す
**Then** その本文は `bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` の
呼び出し 1 件のみからなり、`--with-merge` を含まず、PR / merge 状態を参照する
コマンドを含まない

#### Scenario: existing start and resume dispatch behavior is unchanged

**Given** `.github/workflows/specrunner-dispatch.yml`
**When** `$ACTION` が `resume` または既定の `start` のときに実行される分岐の本文を取り出す
**Then** それぞれ `job resume --from-issue`（`--from` / `--prompt` / `--force` の
条件付き付与を含む）と `job start --from-issue "$ISSUE"` を呼び出す従来の内容のままである

---

### Requirement: Archive-from-issue shall resolve the slug from a base-borne archive record when local state is absent

`job archive --from-issue <n>` は、completed marker から得た jobId で local state を
引き当てられなかったとき、checkout 済み base 上の archive record から slug を解決
SHALL する。照合は record の `jobId` と `issueNumber` の**両方**が一致することを
要件とし、change folder が `specrunner/changes/archive/` 配下にある record のみを
対象と SHALL する。

この経路で slug が解決されたとき、closing PR の列挙・head branch の fetch・
checkpoint の rebind・workspace の setup をいずれも実行しては MUST ならない。
merge 済みの確認と終端処理は既存の archive 実行経路に委譲 SHALL する。

#### Scenario: post-merge resolution with the head branch deleted

**Given** completed marker から jobId が解決でき、
かつ local state 参照が job を引き当てられず、
かつ checkout 済み base の `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/state.json` に
同じ `jobId` と同じ `issueNumber` を持つ record が存在し、
かつ PR の head branch は merge 時に削除済みである
**When** `job archive --from-issue <n>` を実行する
**Then** 当該 record の slug で archive 実行に入り、closing PR の head branch fetch と
checkpoint rebind はいずれも行われず、exit code 0 で終了する

#### Scenario: record with a mismatched jobId is not resolved

**Given** local state 参照が job を引き当てられず、
かつ base の archive record の `issueNumber` は一致するが `jobId` が異なる
**When** `job archive --from-issue <n>` を実行する
**Then** その record は解決対象にならず、closing PR 経路へ移る

#### Scenario: record with a mismatched issueNumber is not resolved

**Given** local state 参照が job を引き当てられず、
かつ base の archive record の `jobId` は一致するが `issueNumber` が異なる
（`issueNumber` を持たない record を含む）
**When** `job archive --from-issue <n>` を実行する
**Then** その record は解決対象にならず、closing PR 経路へ移る

#### Scenario: an active change folder is not treated as an archive record

**Given** local state 参照が job を引き当てられず、
かつ `jobId` と `issueNumber` が一致する state が
`specrunner/changes/<slug>/`（archive 配下ではない位置）にのみ存在する
**When** `job archive --from-issue <n>` を実行する
**Then** その state は archive record fallback の解決対象にならない

---

### Requirement: Existing resolution paths shall retain priority and fallback behavior

archive record fallback は、local state 参照の**後**、closing PR 経路の**前**に位置
SHALL する。local state が引き当たる場合は従来どおり local state の slug を用い、
archive record fallback を実行しては MUST ならない。
archive record が見つからない場合は従来どおり closing PR + attach 検証の経路を
用い SHALL する。いずれの経路でも target を確定できない場合は
`ARCHIVE_FROM_ISSUE_UNCONFIRMED` を返 SHALL す。

#### Scenario: local state takes priority over the archive record

**Given** completed marker から得た jobId で local state が引き当たる
**When** `job archive --from-issue <n>` を実行する
**Then** archive record の探索も closing PR の列挙も行われず、
local state から得た slug で archive 実行に入る

#### Scenario: pre-merge falls through to the closing PR path

**Given** local state 参照が job を引き当てられず、
かつ checkout 済み base に当該 jobId の archive record が存在せず、
かつ closing PR が open で head branch が存在する
**When** `job archive --from-issue <n>` を実行する
**Then** closing PR の head branch から checkpoint identity を照合する経路と
attach 検証が実行され、その結果得られた slug で archive 実行に入る

#### Scenario: neither path resolves a target

**Given** local state 参照が job を引き当てられず、
かつ checkout 済み base に当該 jobId の archive record が存在せず、
かつ closing PR のいずれも identity 照合を通らない
**When** `job archive --from-issue <n>` を実行する
**Then** `ARCHIVE_FROM_ISSUE_UNCONFIRMED` が返る

---

### Requirement: The archive-record signal shall have a single definition

change folder が archive record であるか（`specrunner/changes/archive/` 配下にあるか）の
判定は単一の共有述語を経由 SHALL し、archive record fallback の slug 解決と
archive 実行時の `archiveRecorded` 判定はその同じ述語を使用 SHALL する。

#### Scenario: fallback-resolved slug is seen as archive-recorded by the archive run

**Given** archive record fallback が base 上の record から slug を解決した
**When** その slug で archive 実行の job context を解決する
**Then** その job context の `archiveRecorded` は true になり、
「record 作成前に merge された」という順序エラーの escalation は発生しない
