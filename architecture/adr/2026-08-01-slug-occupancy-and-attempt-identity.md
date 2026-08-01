# ADR-20260801: slug 占有不変条件 — 非 terminal attempt の slug 単一性と状態基準解決

## ステータス

accepted

## コンテキスト

`domain-model.md` は slug ＝ 作業単位の identity、jobId ＝ attempt の identity と定義し、同一 slug の attempt の複数併存を許している。しかし併存を律する規則が正典に無く、実装は 2 つのヒューリスティックで代用してきた:

- **slug→job 解決**は「`updatedAt` 最新の state が正」（`src/core/resume/resolve-job.ts`）
- **重複起動防御**は「liveness sidecar の pid が生存していれば拒否」（`src/core/runtime/duplicate-slug-guard.ts`）— pid が死んでいる非 terminal job（halt 済み `awaiting-resume` 等）は検査対象外

このため「同時に生きる attempt は高々一つ」という暗黙の前提を誰も強制しておらず、前提が破れた断面でヒューリスティックが誤る。実際に 0.4.8 利用プロジェクトで発生した事故: halt 中（`awaiting-resume`）の slug へ誤って `job start` → 新 attempt が sidecar を上書き → 新 attempt を `job cancel`（sidecar は残置）→ `resume <slug>` は updatedAt 最新の **cancel 済み** attempt を選んで拒否、`show <旧jobId>` は sidecar 索引から消えた旧 attempt を発見できず、復旧手段が CLI の外（内部ファイルの手術）にしか無かった。

さらに `dynamic-model.md` の liveness 束縛は「論理ジョブ ↔ 物理実行コンテキスト」の束縛と定義しながら、置き場を `.specrunner/local/<slug>/` と slug キーで記しており、束縛の identity（attempt）と記録のキー（slug）の関係が未定義だった。

## 決定

**D1 — slug 占有不変条件。** ある時点で非 terminal（`status ∉ TERMINAL_STATUSES`）の job は slug につき高々一つ。強制点は job 生成の入口（start guard）: 非 terminal の先住 job がいる slug では job を作らず、先住の状態を名指しして出口（`resume` / `cancel`）を案内して拒否する（検査して throw＝状態を作らない）。guard は fail-closed — state が読めない（破損・IO 失敗）場合に「確認できないから通す」を選ばない。

**D2 — 状態基準の slug 解決。** 変更系コマンドの slug→job 解決は状態で一意に決める: 非 terminal が一つならそれ／ゼロなら拒否／複数（不変条件の破れ）なら暗黙選択せず候補を列挙して停止する。時刻順（`updatedAt`）は表示の並び専用であり、変更対象の選択根拠にしない。

**D3 — 束縛の所有規則。** liveness sidecar の所有者は非 terminal job のみ。terminal へ遷移した job・state 上に存在しない job の sidecar は stale であり、後続 attempt が check-and-claim（先住の状態を確認してから上書き）で奪ってよい。同時 claim の競合は後着が決定的に敗北する。解除（削除）は自 jobId と一致する記録に限る。

**D4 — 破れの裁定は人間。** 占有不変条件が破れた断面（非 terminal 複数・sidecar と実体の食い違い）の修復で、機械は「どれが本物か」を推測しない。一意に決まる場合（非 terminal が一つ）のみ機械修復を許し、複数候補は列挙して人間に裁定させる（doctor 経路）。

> guard の案内文・拒否の error code・doctor の操作面など「何をどう表示するか」は振る舞いであり、spec（`specrunner/changes/`）側で定義する。本 ADR は identity・占有・所有の意味論のみを定める。

## 構造的含意

- **slug ハンドルの意味論が確定する**: 占有不変条件が守られている限り、slug 指定の変更系操作は状態だけで一意に解決でき、「最新が正」というヒューリスティックは不要になる。
- **`<slug>/` layout は縮退表現として存続する**: 記録のキーを jobId 化する再編（全コマンドの slug 解決を単一カタログへ集約する構造変更を含む）は将来 work。その時点で「slug→job 解決は単一カタログ経由のみ」を静的 call-site 制約として `model.md` §4（B-x）へ昇格できる。本 ADR はその前提となる意味論を先に定める。
- **§4 へは今回入れない**: 占有不変条件は実行時・複数経路（start / cancel / resume / crash）にまたがる創発型不変条件であり、§4 の 2 系統（依存方向・静的 call-site 制約）と歯の種類が違う。歯は import 検査ではなくシナリオテスト（実装 change の受け入れ基準で名指し）で持つ。

## 検討した代替案

- **auto-resume（start が既存 attempt の再開に化ける）** — 系が利用者の意図を推測する判断点を新設する。halt 後に request 内容を編集した利用者の「直した内容でやり直したい」という意図と黙って乖離し（旧 request を積んだ attempt を checkpoint から続行する）、乖離は完走まで観測できない。start と resume の動詞の意味も濁る。棄却。
- **resume の jobId 直指定** — 占有不変条件が守られていれば slug で常に一意であり不要。生やすと、不変条件が破れた状態を正規の操作で歩ける入口になる。jobId を握る操作は cancel / doctor（手術の動詞）に限る。棄却。
- **時刻基準選択の維持** — 「最新＝唯一生きている」というヒューリスティックが不変条件の代用を務める構造そのものが今回の欠陥。前提を強制した上でもなお時刻に依存する理由が無い。棄却。

## 結果

**Positive**: slug の意味（一つの名前に生きている attempt は一つ）が入口で機械強制され、slug ハンドルの変更系操作が原理的に一意になる。事故の族（sidecar の取り合い・コマンド間で見える job が食い違う・cancel 済みの選択）の発生源が塞がれる。破れた既存断面には CLI 内の修復口（doctor）が与えられ、復旧が内部ファイルの手術でなくなる。

**Negative**: 掃除されていない非 terminal job を残す repo では、同 slug の `job start` が拒否されるようになる（従来は通っていた・破壊的変更）。出口は拒否文が案内する。
