# Designs

どの案も、人間向け表示は 0018 の `Sink` の一実装で、`run` のコードは変わらない。

## A. @clack/prompts を描画に使う

`LogRecord` を clack の `log.*` に振り分ける Sink を用意する。

```ts
import { log } from "@clack/prompts";

const clackSink: Sink = (record) => {
  switch (record.kind ?? record.level) {
    case "step":
      return log.step(record.message);
    case "success":
      return log.success(record.message);
    case "warning":
      return log.warn(record.message);
    case "error":
    case "fatal":
      return log.error(record.message);
    default:
      return log.info(record.message);
  }
};
```

- 利点: 見た目と対話入力（0021）の描画を clack に任せられ、実装が最小。
- 欠点: hacksh に依存が増える。`properties` の表示や JSON 形式との統一は自前で補う必要がある。

## B. 自前の小さな描画 + テーマ

`node:util` の `styleText` で色を付け、記号と色をテーマとして持つ。

```ts
interface Theme {
  symbols: Record<
    "start" | "bar" | "end" | "step" | "success" | "info" | "warning" | "error",
    string
  >;
  colors: Record<LogLevel | LogKind, Parameters<typeof styleText>[0]>;
  formatProperties?(properties: Record<string, unknown>): string | undefined;
}

const defaultTheme: Theme = {
  symbols: {
    start: "┌",
    bar: "│",
    end: "└",
    step: "◇",
    success: "✔",
    info: "●",
    warning: "▲",
    error: "■",
  },
  colors: { info: "blue", success: "green", warning: "yellow", error: "red" /* ... */ },
};

function createPrettySink(options: {
  theme?: Partial<Theme>;
  color: boolean;
  write(text: string): void;
}): Sink;
```

- 利点: 依存が増えない。テーマで記号を ASCII に落とすなどの調整ができる。
- 欠点: 描画と対話入力（0021）の実装・保守を自前で持つ。

## C. 表示を Sink の差し替えに任せ、既定は最小

hacksh は記号付きの1行表示だけを既定で持ち、clack 風の表示は別エントリ（例: `hacksh/clack`）として提供する。

```ts
import { clackSink } from "hacksh/clack"; // @clack/prompts を optional peer にする

await runMain(main, { sink: { pretty: clackSink } });
```

- 利点: 本体を軽く保ち、表示の好みを利用者に委ねられる。
- 欠点: 既定の見た目は clack 風にならない。エントリが増え、0021 の対話入力も同じ分割を追うことになる。
