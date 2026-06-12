# 設計思想

SpecRunner の構造は3つの柱から導かれている。どれも「LLM を信用しないことで、LLM を最大限使う」という一つの姿勢の現れである。

## 1. 判断は導出する — agent に自己申告させない

レビュー系 step（judge）の agent が返すのは findings の列挙であって、verdict ではない。

- `approved` / `needs-fix` は CLI が findings から純関数で導出する
- blocking finding が参照する file:line は、実在するかを runtime が検証する（存在しない参照は escalation）
- 収束ループの予算（maxIterations）、step 間の遷移、枯渇時の escalation は state machine が握る

agent には「自分の仕事を自分で合格にする」経路が構造的に存在しない。この分離の対価として得られるものが大きい: **判定の形式がモデルの能力に依存しない**。step ごとに model を差し替えても、安いモデルに落としても、契約は CLI 側にあるので壊れない。判断の質は agent に求めるが、判断の権限は渡さない。

同じ原理は実行のあらゆる層に現れる。reviewer の起動条件は LLM ではなく変更ファイル一覧との glob 照合で決まる。step の完了は宣言された出力契約（writes / tasks-complete）の機械検証で確かめる。transient エラーのリトライ可否は fail-closed のホワイトリストで分類する。**agent が判断する場面を消すことが、LLM の不確実性への根本対策**であり、ルールをプロンプトに足し続けるのは対症療法にすぎない。

## 2. state はプロセスに住まない

実行の真実はすべて観測可能な場所にある。

- job の履歴と成果物は branch-borne（journal + projection として change folder にコミットされる）
- 起動・再開・承認の判断材料は GitHub（ラベル・コメント・PR 状態）
- プロジェクト知識・規律・レビューレンズはリポジトリのファイル

プロセス・セッション・メモリのどこにも一次情報がないため、無人実行は常駐プロセスではなく**定期起動される短命プロセス（tick）の reconcile** でよい。tick は毎回、現状から行うべき操作を再導出する。クラッシュ・再起動・スリープからの回復は専用機能ではなく、通常動作と同一のコードパスの帰結である — 回復経路が常時テストされている状態とも言える（決定の経緯は `architecture/adr/2026-06-12-tick-reconcile-no-daemon.md`）。

この性質は副次的に、モデル価格の変動に対するヘッジでもある。文脈はセッションではなくファイルから毎回再構成されるため、どのモデルが来ても「読めば続きができる」。

## 3. 拡張はデータ

レビューの観点を増やすのに plugin API はない。markdown を1枚コミットする。

- `specrunner/rules/<step>/` — 既存 step への規律の追記（セッション数は増えない）
- `specrunner/reviewers/<name>.md` — 独立した収束ループ・予算・model を持つレビューレンズ。起動条件（paths / requestTypes）も宣言で持つ

これが成立するのは柱1の帰結である。judge の契約（findings の形式・verdict の導出・防御）が CLI 側に標準化されているため、reviewer ごとに異なるのは prompt 素材と設定だけになり、コードの拡張面を開く必要がない。定義は load-time validation で守られ、job 開始時に state へ snapshot されて実行中の変更から隔離される。

**この境界は正直に引いておく**: データで拡張できるのはレビューチェーンであり、pipeline の形そのもの（どの step が存在し、どの順で並ぶか）はコードの領分である。それを変えることは SpecRunner を変えることを意味する。

## 自己ホスティングによる証明

これらの設計は机上のものではない。SpecRunner の機能は SpecRunner 自身の pipeline が実装・レビュー・merge しており、その全過程（escalation・差し戻し・修正・承認を含む）がこのリポジトリの公開履歴に残っている。設計が主張する性質 — 無人での完走、escalation からの復帰、回復の構造的保証 — の証拠は、ドキュメントではなくコミット履歴と PR である。
