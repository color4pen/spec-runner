# Spec: 欠落指摘 finding の構造化宣言と反転検証

## Requirements

### Requirement: finding は対象ファイルの欠落を構造化宣言できる

`Finding` 型および JUDGE / CODE_REVIEW / CONFORMANCE / REQUEST_REVIEW の report tool schema は、
各 finding が「`file` が指す path の欠落自体を指摘している」ことを表す optional boolean
`fileMissing` を MUST 持つ。tool description は「あるべきファイルが存在しないことを指摘する場合に true、
`file` には欠落している path を書く」旨を MUST 明記する。CLI は `fileMissing` の値が `true` のときのみ
欠落宣言とみなし、absent / false / true 以外の値は非宣言（従来挙動）として SHALL 扱う。

#### Scenario: 欠落宣言 finding が parse で保持される

**Given** report tool 入力の findings 要素に `fileMissing: true` が含まれる
**When** CLI が `parseFindings` で finding を取り込む
**Then** その `Finding` の `fileMissing` が `true` になる

#### Scenario: 非宣言 finding は従来通り

**Given** findings 要素に `fileMissing` が無い、または `true` 以外
**When** CLI が `parseFindings` で finding を取り込む
**Then** その `Finding` の `fileMissing` は未設定（= 非宣言）になる

### Requirement: finding-ref 検証は欠落宣言別に期待を反転する

judge 系 step の finding-ref 実在検証は、verdict に影響する finding
（severity critical/high または resolution decision-needed）を欠落宣言別に分割し、`verifyFindingRefs`
seam（非実在 ref の部分集合を返す；意味論不変）を使って次のように判定 SHALL する。非宣言 finding は
「file が実在すること」を、欠落宣言 finding は「file が実在**しない**こと」を MUST 検証する。いずれかが
不整合（非宣言なのに不在、または欠落宣言なのに実在）なら verdict を `escalation` に MUST 上書きし、
`verdictOverriddenByFindingRef` を立てる。両群とも整合なら verdict 導出結果を SHALL 保持する。

#### Scenario: 正当な欠落指摘の routing が保たれる（#916）

**Given** judge step の verdict 導出が needs-fix 系 routing を返し、その critical/high または
decision-needed finding が `fileMissing:true` かつ実在しない `file` を指す
**When** finding-ref 検証が走る
**Then** escalation 上書きは起きず、routing 付き verdict がそのまま保たれる

#### Scenario: 虚偽の欠落宣言は escalation に上書きされる

**Given** critical/high または decision-needed finding が `fileMissing:true` だが `file` が実在する
**When** finding-ref 検証が走る
**Then** verdict は `escalation` に上書きされる

#### Scenario: 非宣言 finding の不在は従来通り escalation に上書きされ routing が消える

**Given** critical/high または decision-needed finding が非宣言（`fileMissing` 無し）で `file` が
実在しない
**When** finding-ref 検証が走る
**Then** verdict は `escalation` に上書きされ、`escalationReason` は付かない

#### Scenario: local / managed 両 runtime で同一挙動

**Given** 同一の欠落宣言 finding と同一の file 実在状況
**When** `verifyFindingRefs` を local 実装（filesystem）と managed 実装（GitHub API）でそれぞれ
経由して検証する
**Then** どちらの runtime でも上書き有無の判定は一致する

### Note: `fileMissing: true` + `resolution: "decision-needed"` の組み合わせ挙動

`collectVerdictAffectingFindings` は `resolution: "decision-needed"` の finding を検証対象に含む。
よって `fileMissing: true` かつ `resolution: "decision-needed"` の finding も ref 検証対象になる。

ただしこの組み合わせでは **escalation verdict は変わらない**。`deriveJudgeVerdict` の priority #3
（decision-needed finding が 1 件以上 → escalation）が ref 検証とは独立して escalation を確定させる
ため、ref 検証で override が発生してもしなくても最終 verdict は escalation になる。

影響があるのは `escalationReason` の有無のみ: ref 検証 override 発生時は
`verdictOverriddenByFindingRef = true` が立ち escalationReason 計算が抑止される（D5 と同様）。
override が発生しない場合は escalationReason の canon 計算が走る。いずれの経路でも verdict は escalation
のため、ユーザーから見える挙動（operator escalation）は同一である。

### Requirement: 欠落宣言 finding では line を検証に使わない

欠落宣言 finding（`fileMissing:true`）の ref 検証では `line` を MUST 渡さず、file の有無のみで
SHALL 判定する。存在しないファイルに行番号は存在しないため。

#### Scenario: 欠落宣言 finding の line は無視される

**Given** `fileMissing:true` かつ `line` を持つ finding
**When** finding-ref 検証が seam に ref を渡す
**Then** その ref に `line` は含まれず、file の有無のみで整合が判定される
