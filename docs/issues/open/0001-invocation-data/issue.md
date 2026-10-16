---
title: 呼び出しごとの値を run に渡せない
theme: citty-parity
---

# Problem

`runCommand` は引数列と出力関連のオプションを受け取り、`run` のコンテキストには引数情報や logger がある。呼び出し側が持つ値（設定やクライアントなど）を1回の実行だけに渡す手段がない。

利用者は値をモジュールのスコープに置くか、呼び出しごとにコマンド定義を作り直すことになる。前者では、同じ定義をテストなどで複数回・同時に実行すると値が呼び出し間で共有される。

解決後は、呼び出しごとに異なる値を型付きで `run` から参照でき、その値は別の呼び出しへ持ち越されない。

# Coordination

`reliable-invocation` の0028と context の所有範囲を共有する。任意の利用者データと、ライブラリが管理する signal・logger・exec は区別する。並行実行で値を共有せず、汎用 DI コンテナは導入しない。

# Open Decisions

- 単独で入れるか、前後処理（0005）やプラグイン（0006）と組で扱うか。
- 親子のコマンド間で値を共有する範囲。

# Related Files

- `src/run.ts` — `runCommand` と `run` の呼び出し
- `src/command.ts` — `CommandContext`

- `docs/themes/reliable-invocation.md`
- `docs/issues/0028-invocation-cancellation/issue.md`
