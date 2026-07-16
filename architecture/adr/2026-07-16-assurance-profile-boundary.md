# ADR-20260716: assurance profile と宣言的実行保証の境界

## ステータス

proposed。構造判断のみを定める。ADR-20260713（execution ownership）・ADR-20260715（remote checkpoint 境界）の隣に位置し、pipeline が「どの品質工程を、どの保証水準で走らせたか」を宣言的かつ検証可能にする境界を定める。

proposed は decision（構造判断）が未 ratify であることを意味する。profile カタログ・fast の工程構成・CLI・`verify` の振る舞いは後続 behavior（spec ＋ `specrunner/adr/`）が担い、本 ADR は提供済み機能を主張しない。

## コンテキスト

pipeline は現状ほぼ single topology で全工程を走らせる。工程を安く抜く（fast）需要は実在するが、素朴な「type または flag で工程を silent に省く」実装は、失った品質保証を隠蔽する。特に危険な失敗モードが三つある:

- **保証水準の silent 導出**: 保証水準が `request.type` から自動導出されると、type を選ぶだけで検査が緩む。`request.type` は request が持つ値であり、作成者や agent が触れる授権面（承認後の本文すり替え TOCTOU と同じ面）。ここから保証水準を導出することは授権バイパスになる。
- **空洞の歯**: test を「今書いたコードに通るだけ」で書くと、green の PR が何も保証しない。工程を融合するほどこの confirmation bias に落ちやすい。
- **保証水準のすり替え**: 別環境 resume で `fast` の定義自体が変わり得るため、保証水準が実行途中で silent に別物へ置き換わる。

したがって「何を保証したか」を宣言的な branch-borne 属性にし、attach / resume で検証し、保証の証拠を機械生成する境界が要る。工程融合の可否も、authority（誰が承認し誰が作成し誰が検証するか）を基準に定める必要がある。

## 決定

- **D1（assurance は declared・branch-borne・immutable-per-job）**: job の実行保証は正規化された **effective profile** `{ id, schemaVersion, policyDigest, budget, assurance }` として `JobState` に branch-borne に載せ、job 生存中は immutable とする。runtime に profile を silent に導出・再解決させない。`standard` も明示 profile の一つであり、profile 非表明は許さない。`assurance` は `budget`（`maxIterations` / `reviewDepth` 等の cost）とは別軸で、「どの保証を省いたか」を隠さないために分離する。

- **D2（type は bite strategy を決める、assurance level を決めない）**: `request.type` が決めてよいのは「不変を**どう証明するか**（bite strategy）」であり、「**どれだけ工程を省くか**（assurance level）」ではない。level の唯一の源は effective profile。これにより、緩い授権面（type）から強い授権判断（保証水準）が導出される経路を塞ぐ。

- **D3（BiteEvidence は機械生成・category 別、自己申告でない）**: 「test が歯である」ことは、gate が記録された base / candidate commit OID に対して test を実行して生成する `BiteEvidence` で判定する。scenario は安定 ID（SC-XXX）を持ち、`{ test, biteStrategy, base result, candidate result }` の対応表を branch-borne artifact とする。strategy は category 別に定める:
  - forward（bug-fix / new-feature）: base-red → candidate-green
  - security: 攻撃 fixture が base で成立 → candidate で拒否
  - refactoring: 既存 behavior contract を無改変で維持（期待値改変を信号化）＋変更表面への targeted mutation
  - config / infra: 旧構成・negative fixture が fail → candidate で success

  agent の自己申告は evidence でない。judge は記録 OID での実行結果のみを歯として受ける。

- **D4（scenario freeze と composite execution unit の commit topology）**: 同一 authority の creator 工程（test 導出と実装）を融合してよい。ただし融合するのは execution であって authority ではなく、歯を残すには内部 commit 境界が要る: **scenario 固定（安定 ID ＋ hash、branch-borne）→ test materialize（= base）→ implement（= candidate）**。要求される commit topology は bite strategy が決める（forward は test-before-impl 境界、refactoring は pre-change base ＋ mutation、config は旧構成 fail 境界）。融合してよいのは同一 authority の creator のみで、approver↔creator・review↔fix・verify↔creator は融合しない（自己承認・独立性喪失・検証意味の希薄化を招くため）。

- **D5（floor は out-of-loop authority で branch-borne）**: protected paths / security request には `minimumAssurance` floor（例: `testDerivation: frozen`, `biteEvidence: required`, `coupled` 禁止）を課す。floor は main-checkout 側の out-of-loop authority で branch-borne に評価し、worktree 内から下げられない。effective profile が floor を下回れば強制昇格または fail-closed とする。

- **D6（profile の attach / resume 検証と provenance）**: attach は（ADR-20260715 D2 の tree 検証の隣で）effective profile digest の一致を検証し、resume 側が profile を解釈できなければ fail-closed とする。ローカルの同名 profile を再解決してはならない（Machine 間で `fast` の定義が変わり得るため、digest 一致のみを信頼する）。produced PR は effective profile と BiteEvidence 要約を provenance として運び、第三者のオフライン再検算に供する。

## 構造的含意

- **保証は宣言的 branch-borne 属性**: effective profile と assurance 水準を `JobState` の不変条件に含める（`domain-model.md`）。cost（budget）と assurance を別軸として明示する。
- **融合可否の判定基準は role = authority**: descriptor の `roles`（creator / reviewer / verifier）にエンコード済みの authority 構造をそのまま融合可否の基準にする。profile は topology を差し替えるのではなく、共通 Step の **artifact contract ＋ budget** を選ぶ。profile 別 Step 実装は作らない。
- **安全性・状態遷移・checkpoint は profile 非依存で共有**: guard-halt / awaiting-resume / publisher / transition / checkpoint 機構は profile によらず単一。profile が変えるのは品質工程の構成のみ。
- **歯の判定は検証に閉じる**: BiteEvidence の適合性は gate / attach の検証で判定する（ADR-20260715 と同じ扱い）。静的構造不変（B 系）は実装で BiteEvidence のコンポーネント境界が確定した時点で追加し、今は掲載しない。
- **floor は既存の授権面に乗る**: `minimumAssurance` の out-of-loop 評価は、protected-path 権威（#820）・承認整合性（#831）と同一の授権面に属する。

## 検討した代替案

- **profile を `request.type` から silent 導出**: type は授権面が緩い値であり、level 導出は検査を緩める授権バイパスになる。type は bite strategy のみを決める（D2）。却下。
- **profile 別 Step 実装（`FastImplementerStep` 等）**: 並行クラス階層を生み保守不能。profile は共通 Step の artifact contract ＋ budget を選ぶ。却下。
- **共通 Step への `if (profile === "fast")` 分岐**: 分岐が散らばり「どの保証を失ったか」が追えなくなる。契約を profile object に集約する。却下。
- **scenario を prompt の順序命令だけで固定**: 同一ターンでは scenario 確定前後を機械的に観測できず、test を後から実装へ寄せられる。hash 固定＋内部 commit 境界＋機械実行 BiteEvidence が要る（D3 / D4）。却下。
- **BiteEvidence を agent の自己申告で受ける**: 申告は歯でない。gate が記録 OID で test を実行して生成する。却下。
- **bite を「実装を外して落ちる」（reversion mutation）に固定**: bug-fix / new-feature には強いが、behavior-preserving refactoring では正しい変更でも base で通るため誤判定になる。category 別 strategy に一般化する（D3）。却下。

## 結果

- **Positive**: fast が「工程を silent に抜く機能」から「**保証水準を宣言して実行する機能**」へ変わる。省いた保証が profile・provenance・floor で可視化され、消費者側から観測できる。歯（BiteEvidence）は category を跨いで機械検証され、refactoring の behavior 保存も含む。保証水準は branch-borne で、別環境 resume を跨いで immutable。
- **Negative**: composite execution unit は内部 commit 境界を要する（実装コスト）。gate は base / candidate OID で test を実行する（時間コスト）。profile カタログと `schemaVersion` の互換管理が要る。

---

> profile カタログ・fast の工程構成・`verify` CLI・provenance 表示の観測可能な振る舞いは behavior（spec ／ `specrunner/adr/`）が定める。本 ADR は境界のみで、実装経路は後続の behavior request 群が担う。
