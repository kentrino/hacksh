---
title: 呼び出しごとの値を run に渡せない
theme: citty-parity
---

# Problem

`runCommand(command, argv)` は引数列だけを受け取り、`run` のコンテキストは `cmd`・`args`・`rawArgs`・`passthrough`・`extraArgs` に限られる。呼び出し側が持つ値（設定やクライアントなど）を1回の実行だけに渡す手段がない。

利用者は値をモジュールのスコープに置くか、呼び出しごとにコマンド定義を作り直すことになる。前者では、同じ定義をテストなどで複数回・同時に実行すると値が呼び出し間で共有される。

解決後は、呼び出しごとに異なる値を型付きで `run` から参照でき、その値は別の呼び出しへ持ち越されない。

# Open Decisions

- 単独で入れるか、前後処理（0005）やプラグイン（0006）と組で扱うか。
- 親子のコマンド間で値を共有する範囲。

# Related Files

- `src/run.ts` — `runCommand` と `run` の呼び出し
- `src/command.ts` — `CommandContext`
