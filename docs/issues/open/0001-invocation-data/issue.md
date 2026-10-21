---
title: 呼び出しごとの値を run に渡せない
theme: citty-parity
---

# Problem

`runCommand` は引数列と出力関連のオプションを受け取り、`run` のコンテキストには引数情報や logger がある。呼び出し側が持つ値（設定やクライアントなど）を1回の実行だけに渡す手段がない。

利用者は値をモジュールのスコープに置くか、呼び出しごとにコマンド定義を作り直すことになる。前者では、同じ定義をテストなどで複数回・同時に実行すると値が呼び出し間で共有される。

解決後は、呼び出しごとに異なる値を型付きで `run` から参照でき、その値は別の呼び出しへ持ち越されない。

# Coordination

0028 は完了し、`signal`・logger・exec は呼び出しが所有する。利用者が渡す値はそれらと区別する。並行実行で値を共有せず、汎用 DI コンテナは導入しない。

値の範囲は1回の呼び出しに閉じる。親子のコマンドで値や接続を共有しない。前後処理（0005）は却下した。

# Open Decisions

- プラグイン（0006）と組で扱うか。

# Related Files

- `src/run.ts` — `runCommand` と `run` の呼び出し
- `src/command.ts` — `CommandContext`

- `docs/themes/reliable-invocation.md`
- `docs/issues/closed/0028-invocation-cancellation/issue.md`
