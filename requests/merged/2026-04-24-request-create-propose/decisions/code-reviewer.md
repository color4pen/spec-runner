# Code Reviewer Decisions

## 2026-04-24 Iteration 1

- IDOR 検証を MEDIUM ではなく HIGH に据え置く :: getChangeFolderFileContent の filePath パラメータにパストラバーサル防御がないため。所有権検証はあるが、任意のリポジトリファイルが読めてしまう
- startPropose のロールバックでセッション cancel を省略している点を MEDIUM にする :: try-catch でセッション作成後の sendMessage 失敗時にセッションが orphan になるが、Managed Agents 側でセッションは自然消滅するため実害は限定的
- テストの静的解析パターンを MEDIUM にする :: review-lessons.md で「ソースコード静的解析テストがビジネスロジックの検証に使われていないか」が指摘済み。TC-014/015/016 は startPropose の振る舞いテストではなく文字列存在チェックに留まっている
- slug の再導出パターンを MEDIUM にする :: getChangeFolderFiles と handleProposeCompleted で slug を毎回 createdAt+title から再計算している。title が変更可能になった場合に不整合が生じるが、現状 title は immutable なので MEDIUM
- getDirectoryContents の path encoding を指摘しない :: encodeURIComponent でスラッシュもエンコードされるが、GitHub API はエンコード済みパスを正しく処理する（動作確認済みパターン）。ただし今回の実装ではパスにスラッシュが含まれるため実際には問題がある → HIGH に引き上げ

## 2026-04-24 Iteration 2

- 前回 HIGH 2件（encodeURIComponent + path traversal）の修正を確認し approved に判定する :: 両修正とも適切に実装されており、副作用・退行なし
- テストの静的解析パターン（TC-014/015/016）を引き続き MEDIUM にする :: 前回指摘から未修正だが、directive チェック的な側面もあり、かつ better-sqlite3 の import 制約という技術的障壁がある。HIGH には引き上げない
- startsWith のトレイリングスラッシュ不足を LOW にする :: slug はサーバー側で request.createdAt+title から導出しており、攻撃者が制御不能。prefix 衝突は理論的には可能だが実務上発生しない
- correctness を 6→8 に引き上げる :: slug 日付統一と encodeURIComponent 修正により、前回の correctness 低下要因が全解消
- security を 6→8 に引き上げる :: path traversal ガードと XML デリミタ追加により、前回指摘の2点が解消。残存は startsWith の微小改善のみ
- architecture を 7→8 に引き上げる :: verifyRequestWithRepository 抽出により DRY 違反が解消
- testing を 7→6 に引き下げる :: 前回のスコアリングでは静的解析テストの問題を甘く評価していた。TC-014/015/016 が未修正であり、review-lessons の明示的指摘事項であることを重視
