# ADR-20260612: merge と archive の意味論を分離する

## ステータス

accepted

## コンテキスト

job の終端には2つの操作が関わる。PR を main に取り込む merge と、change folder の archive 移動・worktree 撤去・job status 更新を行う archive である。merge をトリガーに archive を自動実行する（または archive を merge に内包する）案と、archive を独立した人間のジェスチャーとして保つ案がある。複数人運用では「誰が finalize するか」の帰属、レビュー指摘による merge 前の追加修正（fixup）では「merge 後に branch がまだ動く」可能性が、それぞれ意味論に影響する。

## 決定

- **D1**: archive は merge から独立した、人間が明示的に起動する finalize ジェスチャーとする。merge されたことは archive の前提条件ではあるが、トリガーではない。
- **D2**: merge を archive に同梱するのはオプション（`job archive --with-merge`）であって、core の意味論ではない。--with-merge は「CLEAN を待って merge してから archive する」という合成コマンドであり、archive 単体の意味を変えない。
- **D3**: pipeline の終端状態は awaiting-archive とし、pipeline は merge にも archive にも自動では進まない。取り込みの判断（レビュー・タイミング・取り込み順）は人間の領分として pipeline の外に置く。

## 帰結

- merge の主体（GitHub UI / 他のメンバー / --with-merge）に依らず archive の挙動が同一になり、複数人運用で「merge する人」と「finalize する人」を分離できる。
- merge 後に branch へ追加 commit が積まれる運用（merge 前のレビュー修正が複数回続く場合など）でも、archive のタイミングを人間が選べるため、撤去が早すぎて作業場所を失う事故がない。
- 却下した代替（merge トリガーの自動 archive）: 操作が 1 回減る利点はあるが、archive の変更（change folder の移動 commit）が merge 直後の main に自動で積まれることになり、「main への書き込みは人間の明示判断に紐づく」という運用境界が崩れる。また fixup 系の運用と本質的に衝突する。
