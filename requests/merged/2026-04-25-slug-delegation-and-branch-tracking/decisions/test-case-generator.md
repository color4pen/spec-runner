# Decision Log: test-case-generator

## Decisions

- must-areas の 5 領域（register_branch Custom Tool ハンドリング、SSE requires_action イベント処理、branch_name DB 永続化、差分 URL 生成、change folder ビューア）に属するテストケースを全て must とする :: pipeline-context.md の Test Case Generation 指定に基づき、これらが壊れると本変更の中核機能が成立しない

- Custom Tool ディスパッチャ（handleCustomToolUse）のテストを integration category とする :: DB 更新と Anthropic API 呼び出しの両方を含むため unit では検証困難。DB モックを含む統合レベルが適切

- register_branch 入力バリデーションのテストを unit category とする :: バリデーションロジック自体は純粋なロジックとして分離可能（tasks.md 3.2 の明示的バリデーション仕様がある）

- SSE ループの requires_action 検知テストを integration category とする :: stream route の動作は SSE ループ全体の振る舞いであり、単体では検証できない

- 差分 URL 生成テストを unit category とする :: URL の文字列組み立てロジックは純粋関数として検証可能

- change folder ビューアのフォールバックテストを integration category とする :: DB 状態（branch_name の有無）に依存するため、DB アクセスを含む統合レベルが必要

- パストラバーサル防止テストを should priority とする :: セキュリティ上重要だが、spec-review の emphasis に記載されており、security-reviewer が別途評価するため must には含めない。ただし code-review で HIGH 扱いになりうるため should 以上に設定

- buildProposeMessage シグネチャ変更テストを should priority とする :: slug/branchName パラメータ削除という破壊的変更を回帰テストで守る必要があるが、中核機能の成否には直接影響しない

- 既存テストへの影響（propose-session tests）を should priority とする :: tasks.md 9.3 に明示されているが、中核機能の新規動作ではなく回帰保証のため

- e2e テストを設定しない :: 本変更はサーバーサイドの Custom Tool ハンドリングと DB 更新が中心であり、UI の差分 URL 表示は integration + manual で十分に検証可能。e2e は実行環境依存が高く、コスト対効果が低い
