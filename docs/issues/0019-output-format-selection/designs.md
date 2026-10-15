# Designs

どの案も、決定結果は次の値に集約され、0018 の `Sink` と 0021 の対話可否を決める。

```ts
interface OutputMode {
  format: "pretty" | "json";
  interactive: boolean; // 対話入力を求めてよいか（0021）
  color: boolean;
}
```

JSON の1行は 0018 の `LogRecord` をそのまま直列化したものにする。

```json
{
  "timestamp": "2026-10-15T09:28:00.000Z",
  "level": "info",
  "category": ["mycli", "deploy"],
  "message": "Deploying web to prod",
  "properties": { "app": "web", "env": "prod" }
}
```

## A. 自動判定 + 組み込みオプション

`--help` と同じく hacksh が `--log-format=<pretty|json>` を予約し、指定がなければ環境から推測する。

```ts
function resolveOutputMode(input: {
  flag?: "pretty" | "json"; // --log-format
  env: NodeJS.ProcessEnv;
  isTTY: boolean;
}): OutputMode {
  const format = input.flag ?? (input.env.CI || !input.isTTY ? "json" : "pretty");
  return {
    format,
    interactive: format === "pretty" && input.isTTY,
    color: format === "pretty" && !input.env.NO_COLOR,
  };
}
```

- 利点: 利用者が何も書かずに、CI では JSON になる。AI エージェントは常に `--log-format=json` を付ければよい。
- 欠点: パイプ（`mycli | less`）でも JSON になる。予約名が利用者のスキーマと衝突しうる。

## B. 予約なし、`runMain` の設定 + 環境変数

フラグを予約せず、作者が `runMain` で方針を決め、利用者は環境変数で上書きする。

```ts
interface RunMainOptions {
  output?: "auto" | "pretty" | "json"; // 既定 "auto"
}

// 優先: HACKSH_OUTPUT=json > options.output > auto（CI 環境変数のみで判定）
await runMain(main, { output: "auto" });
```

- 利点: 引数の名前空間を汚さない。パイプでは人間向け（色だけ止める）のまま。
- 欠点: 呼び出し側が環境変数名を知る必要があり、`--help` に現れない。

## C. 作者が引数から決める

予約も自動判定もせず、作者が自分のスキーマの値から形式を返す。

```ts
await runMain(main, {
  output: ({ args, env, isTTY }) => (args.json || env.CI ? "json" : "pretty"),
});

const main = defineCommand({
  args: z.object({ json: z.boolean().default(false).describe("Output JSON lines") }),
  run({ logger }) {
    /* ... */
  },
});
```

- 利点: オプション名や判定規則を作者が完全に決められ、ヘルプにも出る。
- 欠点: 引数の解析前に出るエラー（未知のコマンドなど）の形式が決まらない。CLI ごとに規則がばらつく。
