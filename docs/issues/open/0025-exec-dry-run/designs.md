# Designs

## 推奨: 省略を判別できる結果にする

```ts
// API 候補。status の名称・成功結果の詳細は0023と合わせて確定する。
const result = await exec("git", ["push", "origin", branch], {
  dryRun: args.dryRun,
});

if (result.status === "skipped") {
  return;
}
// ここでは実際に実行された結果を扱える。
```

省略結果は `status: "skipped"` と実行予定の情報を持ち、stdout・stderr・exitCode は持たせない。通常実行の結果は0023の契約を使う。dryRun 未指定の一般的な呼び出しまで省略結果との分岐を強制しない型にする。

dry-run でもオプションの形や組み合わせは検証する。一方で子を起動しないため、TTY 不在だけで実行予定の表示を拒否する必要はない。端末の使用可否を判定する前に省略へ進む案を推奨する。実行予定が実行可能性の検証済みであるとは表示しない。

読み取り・変更の判定をライブラリが行わず、作者が各呼び出しに dryRun を渡す。グローバルな dry-run、コマンド名の allowlist、自動的な書き込み判定は追加しない。
