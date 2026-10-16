# Designs

## 推奨: 捕捉を既定にし、端末使用は明示する

```ts
// API 候補: 取得した JSON は作者が解析する。
const { stdout } = await exec("orca", ["terminal", "list", "--json"]);

// 端末での対話が必要であることを宣言する。
const selection = await exec("fzf", [], {
  input: table,
  interactive: true,
});

await exec("gh", ["run", "watch", id], {
  stdio: "inherit",
  interactive: true,
});
```

`interactive` は PTY を作る指定ではなく、既存の出力モードと端末条件を確認するための宣言とする。fzf の結果を返す stdout と、fzf が対話に使用する端末は別である。stdout が pipe だから非対話と判断してはいけない。

まず実行開始情報を既存 logger の構造化データで表せるか確認し、専用イベントが必要ならその理由を記録する。実行情報にはファイル名・引数配列・cwd などを持たせる。非表示・秘匿の指定は実行する値を変えない。

子の出力を逐次 printer に流す機能は初期必須範囲に含めない。capture と inherit の契約を先に確定する。子に端末を渡す間は hacksh の prompt と競合させない。
