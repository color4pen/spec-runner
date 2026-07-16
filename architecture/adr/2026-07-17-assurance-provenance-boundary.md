# ADR-20260717: assurance floor の権威を達成 provenance に置く（ADR-20260716 D5 補正）

## ステータス

accepted。構造判断のみを定める。ADR-20260716（assurance profile 境界）の D5（floor）を補正し、D3（BiteEvidence）を精緻化する。本 ADR は境界のみを定め、提供済み機能を主張しない。

補正の対象は「floor が**何を**評価するか」である。ADR-20260716 は assurance を宣言的 branch-borne 属性として確立した（D1）が、floor がその**宣言**を評価するか、pipeline が**達成**した provenance を評価するかを分けていなかった。本 ADR は後者に確定する。

## コンテキスト

ADR-20260716 は job の実行保証を declared・branch-borne・immutable-per-job な effective profile とし（D1）、protected paths / security request に `minimumAssurance` floor を課した（D5）。しかし D5 は floor を「effective profile が下回れば」と定め、**宣言された** assurance を評価対象にしていた。

宣言された assurance と、pipeline が実際に達成した assurance は別物である:

- profile は `biteEvidence: required` を**宣言**しつつ、pipeline は evidence を生成しないことがある（strategy が deferred、runtime が in-gate で test を実行できない、evidence が最終成果物に束縛されていない）。宣言を評価する floor は、この乖離を検出できず、**最強を宣言した profile が、何も証明されていなくても通る**。
- profile 非表明や共通 default が最強値に解決される設計では、達成の裏付け無く最強を名乗れる。floor が宣言を読む限り、これは自己申告を authorize に使うことと同じである。

加えて ADR-20260716 D3 は BiteEvidence の scenario を安定 ID ＋ hash で凍結するが、**歯となる test そのもの（materialize 済み test の blob）** を base 境界以降で凍結していない。したがって:

- 歯を証言する test を base の後で書き換えれば、base-red → candidate-green を偽造できる。
- evidence が file 単位だと、同一 file 内の一つの test が噛むだけで、同居する空洞 test まで verified に巻き込まれる。

floor を健全にするには、その権威を「merge される成果物（最終 PR HEAD）に対して機械達成された provenance」に置き、かつその provenance を偽造不可にする必要がある。

## 決定

- **D1（policy と provenance を分離し、floor は provenance を評価する）**: effective profile は**要求 policy**（何を要求するか）であり、authorize の対象ではない。`minimumAssurance` floor は、profile の宣言 assurance でなく、**最終 PR HEAD に対して機械達成された provenance** が floor を満たす場合にのみ通す。これは ADR-20260716 D5 の「effective profile が floor を下回れば」を「**達成 provenance が** floor を下回れば」に補正する。profile は「何を要求したか」を運び続けるが、floor の可否は「何が証明されたか」だけで決まる。

- **D2（provenance の権威点は out-of-loop archive gate、最終 HEAD で実測）**: 達成 provenance は、changed-files と最終 HEAD が揃う唯一の out-of-loop 点＝archive merge gate（ADR-20260716 D5 と同じ授権面、protected-path 権威の隣）で実測する。in-loop の BiteEvidence 工程は**早期シグナル**であって権威ではない。後続の mutator 工程（build-fix / code-fix）が HEAD を動かすため、in-loop で得た evidence は最終成果物を保証しない。権威ある判定は最終 HEAD に対して out-of-loop で行う。

- **D3（required + 未達 = fail-closed、fail-open を禁じる）**: floor が要求する保証（例 `biteEvidence: required`）に対し、達成 provenance が「無い / 生成不能（runtime が in-gate で確立できない）/ 未達（deferred）/ 旧形式で最終 HEAD に束縛されない」場合は **fail-closed** とする。宣言が required でも達成が無ければ通さない。deferred・unavailable・absent を「安全な degradation」として通す fail-open を禁じる。provenance を確立できない環境では、floor は out-of-loop の human authority に倒す（rubber-stamp しない）。

- **D4（provenance を偽造不可にする: 歯を base→HEAD で凍結、scenario 単位で束縛）**: 達成 provenance が信頼できるのは、歯を証言する test が base 境界以降で改変されていない時に限る。ADR-20260716 D3/D4 の scenario 凍結（安定 ID ＋ hash）を精緻化し、**materialize 済み test（歯そのもの）を base から最終 HEAD まで凍結**し、その凍結が破れたら provenance を無効とする。evidence は scenario 単位（SC-XXX）で最終 HEAD に束縛し、一つの噛む test が同居する空洞 test を代弁できないようにする。base で red・HEAD で green・test が base と同一という三条件を満たす scenario のみ verified とする。

## 構造的含意

- **宣言は authorize に使わない**: effective profile assurance は「要求」を運ぶ属性であり、floor の可否判断には用いない。可否は達成 provenance のみが決める。ADR-20260716 D1（assurance は declared・branch-borne・immutable）は不変で、本 ADR はその宣言を「何に使うか」を絞る。
- **権威点は archive gate に一本化**: 達成 provenance の権威判定は out-of-loop の archive merge gate に置く。protected-path 権威（#820）・承認整合性（#831）・floor（ADR-20260716 D5）と同一授権面に属し、worktree 内から下げられない。
- **in-loop 工程は降格**: in-loop の BiteEvidence 工程は早期シグナル（作者への即時 feedback）に降格し、merge 可否の権威は持たない。
- **provenance 不確立時は fail-closed**: 成果物の verification 構成によっては最終 HEAD で歯を in-gate 実行できないことがある。その場合 floor は通さず human authority に倒す。「実行できない」を「安全」と読み替えない。
- **凍結は scenario と歯の二層**: ADR-20260716 D3 の scenario 凍結に、歯（materialize 済み test blob）の base→HEAD 凍結を重ねる。scenario の hash 一致だけでは provenance の偽造を防げない。

## 検討した代替案

- **floor が宣言 effective profile を評価する（ADR-20260716 D5 の当初形）**: 宣言は達成と乖離し得る（required を宣言して未達、default が最強に解決）。floor が宣言を読むと自己申告を authorize に使うことになる。却下 → 達成 provenance を評価する（D1）。
- **deferred / unavailable を安全な degradation として通す（fail-open）**: 未達を通すと `required` が実質 optional に退化する。かつ fail-open な設計は「未達を通す」こと自体が「通っている」ように見え、自らの穴を隠す。却下 → fail-closed（D3）。
- **provenance を in-loop の BiteEvidence 工程で確定する**: 後続 mutator が HEAD を動かすため、in-loop の evidence は最終成果物を保証しない。却下 → 最終 HEAD に対し out-of-loop で判定（D2）。
- **scenario の hash 凍結のみで十分とする**: 歯を証言する test を base 後に改変でき、base-red → candidate-green を偽造できる。歯そのものも base→HEAD で凍結する（D4）。却下。
- **evidence を file 単位で記録する**: 一つの噛む test が同居する空洞 test を代弁し、verified を汚染する。scenario 単位に落とす（D4）。却下。
- **floor 未満を実行途中で強制昇格する**: profile は immutable（ADR-20260716 D1）。ADR-20260716 D5 が両論とした「強制昇格 or fail-closed」を fail-closed に確定する（D3）。却下。

## 結果

- **Positive**: floor が「宣言された最強」でなく「最終 HEAD で機械証明された達成」だけを通す。達成の裏付けが無い job（default 最強・deferred・unavailable・旧形式）は protected path で通らない。provenance は偽造不可（歯を base→HEAD で凍結、scenario 単位、最終 HEAD 束縛）。fail-open が自らの穴を隠す失敗モードが閉じる。
- **Negative**: 達成 provenance を in-gate で確立するには最終 HEAD で materialize 済み test を実行する必要がある。それを成果物固有の verification 構成（custom command 等）の下で行う capability は別途要り、無い間は protected path が fail-closed で human review に倒れる。archive gate の判定コストが増える。

---

> record schema・凍結検査の手順・floor gate の置換経路・最終 HEAD での歯実行 capability など「何をするか」は後続 behavior request（spec ＋ `specrunner/adr/`）が担う。本 ADR は境界のみで、実装経路は主張しない。
