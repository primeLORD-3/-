# Hatch Pet 原理

`/hatch pet` 的最终产物不是一个绑定 Codex 的复杂程序，而是一套稳定的动画资源协议。

## 生成流程

1. `prepare_pet_run.py` 建立运行目录，写入 `pet_request.json`、`imagegen-jobs.json`、提示词和九个动作行的布局参考。
2. 先生成基础形象 `base`，再把它作为所有动作行的视觉锚点。
3. 逐行动作生成：`idle`、`running-right`、`running-left`、`waving`、`jumping`、`failed`、`waiting`、`running`、`review`。
4. 每一行被切成独立帧，经过透明背景、尺寸、组件连通性等检查。
5. `compose_atlas.py` 把所有帧合成一张 8x9 图集。
6. `package_custom_pet.py` 输出真正可安装的宠物包。

## 最终包

```text
<pet-id>/
  pet.json
  spritesheet.webp
```

`pet.json` 只保存最小清单：

```json
{
  "id": "karin",
  "displayName": "卡琳",
  "description": "宠物描述",
  "spritesheetPath": "spritesheet.webp"
}
```

## 图集协议

```text
总尺寸：1536 x 1872
列数：8
行数：9
单帧：192 x 208
```

行定义：

| 行 | 状态 | 帧数 | 用途 |
| --- | --- | ---: | --- |
| 0 | `idle` | 6 | 待机、呼吸、眨眼 |
| 1 | `running-right` | 8 | 向右移动 |
| 2 | `running-left` | 8 | 向左移动 |
| 3 | `waving` | 4 | 打招呼 |
| 4 | `jumping` | 5 | 跳跃 |
| 5 | `failed` | 8 | 失败、沮丧、报错反应 |
| 6 | `waiting` | 6 | 等待 |
| 7 | `running` | 6 | 正在工作或处理中 |
| 8 | `review` | 6 | 检查、审阅、思考 |

播放时只要按 `row * 208` 和 `column * 192` 裁切，就能拿到对应状态的帧。

## 适配器怎么接

Pet Bridge 把 hatch-pet 看成一个默认协议：

- `pet.json` 提供名字、描述和精灵表路径。
- 精灵表按固定 8x9 网格播放。
- 用户操作、LLM 回复和程序事件只需要映射到状态名。

这就是“无缝衔接”的关键：不要绑定 Codex 内部 UI，只绑定 `state -> row -> frames -> durations`。
