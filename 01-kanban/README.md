# 課題1: カンバンボード — 検証記録

[Laguna S 2.1](https://huggingface.co/poolside/Laguna-S-2.1-NVFP4)（poolside、117.6B MoE / Active 8.5B、NVFP4量子化）のコーディング力検証 課題1。
`index.html` / `style.css` / `app.js` はすべてLagunaが生成したものを**無修正**で収録している（人手・他モデルによる修正なし）。

## 実行環境

| 項目 | 内容 |
|---|---|
| 推論サーバー | ローカル検証機（GB10 / 128GB unified memory）上の vLLM v0.25.1（Dockerイメージ `vllm/vllm-openai:v0.25.1-aarch64`） |
| vLLM主要設定 | DFlash投機デコード K=3 / `--tool-call-parser poolside_v1` / `--reasoning-parser poolside_v1` / `--kv-cache-dtype fp8` / `--max-model-len 32768` / `--gpu-memory-utilization 0.75` |
| 実測生成速度 | 約30 tok/s（単発・1000トークン生成時） |
| エージェント | opencode 1.18.23（OpenAI互換APIで接続） |

## 与えた指示

課題仕様は [TASK.md](./TASK.md)。opencodeへの実行プロンプトは以下の1回のみ:

> TASK.md を読んで、記載された課題を完全に実装してください。実装後、要件を満たしているか自分で見直してください。

## 実行履歴

| 項目 | 結果 |
|---|---|
| 実行時間 | **6分08秒**（1セッション、追加指示・修正ラウンドなし） |
| 特記事項 | 実行中に32Kコンテキスト超過による自動コンパクション1回。Laguna自身がTodoリストを立てて index.html → style.css → app.js の順に実装 |
| 修正ラウンド | **0回**（一発で動作） |

## 検証結果（agent-browser + 手動確認）

- 3カラム表示・カラム追加/名前変更/削除、カード追加（タイトル/説明/5色ラベル/期限日） ✓
- 期限切れカードの赤系強調表示 ✓
- localStorage永続化（リロード後復元） ✓
- ドラッグ&ドロップ移動・検索フィルタ ✓（手動確認）
- コンソールエラーなし ✓
- 横並びカラムで画面幅を使うレイアウト ✓
