# Designs

## 推奨: context に exec を渡し、実行本体を分離する

以下は API 候補。型名やオプションの詳細は実装前に確定する。

```ts
async run({ exec }) {
  const { stdout } = await exec("git", ["branch", "--show-current"]);
  const result = await exec("git", ["symbolic-ref", "--short", "HEAD"], {
    reject: false,
  });
  if (result.failed) return;
}
```

実行本体は `node:child_process.spawn` を使い、終了とストリームの完了を待つ。stdout/stderr を別々に収集し、起動エラーと終了結果を統一した型で扱う。`reject: false` でも不正なオプションなどのプログラミングエラーは例外にする。中断とタイムアウトでは直接起動した子を終了させる。子孫まで確実に停止できるとは約束しない。

context の exec は invocation の printer・出力モードを結び付けた関数とする。logger に実行メソッドを追加するよりも、表示と副作用の責務が明確になる。実行本体の独立は単体テストにも使い、汎用的な依存注入フレームワークは導入しない。

既存ラッパーの全 Result フィールドや ExecaError を再現せず、採用する項目だけを公開する。
