# Pet Adapter Spec

非 hatch-pet 桌宠可以通过 `pet.adapter.json` 导入 Pet Bridge。

## 最小示例

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A custom desktop pet.",
  "spritesheetPath": "spritesheet.png",
  "atlas": {
    "columns": 4,
    "rows": 3,
    "cellWidth": 128,
    "cellHeight": 128
  },
  "states": {
    "idle": {
      "row": 0,
      "frames": 4,
      "duration": 160,
      "label": "待机",
      "icon": "I"
    },
    "waving": {
      "row": 1,
      "durations": [120, 120, 240],
      "label": "招呼",
      "icon": "W",
      "transient": true
    }
  }
}
```

## 字段

- `id`：内部 ID。
- `displayName`：界面显示名。
- `description`：给 LLM 的角色描述。
- `spritesheetPath`：同目录下的精灵表图片。
- `atlas.columns` / `atlas.rows`：精灵表网格。
- `atlas.cellWidth` / `atlas.cellHeight`：单帧尺寸。
- `states.<name>.row`：状态所在行，从 0 开始。
- `states.<name>.colStart`：起始列，默认 0。
- `states.<name>.frames`：帧数。
- `states.<name>.duration`：每帧统一时长，毫秒。
- `states.<name>.durations`：逐帧时长，优先级高于 `frames`。
- `states.<name>.label`：界面标签。
- `states.<name>.icon`：按钮短标识。
- `states.<name>.transient`：播完后回到待机。

## 推荐状态名

为了让默认交互、LLM、TTS 和行为脚本直接工作，推荐尽量使用这些状态名：

```text
idle
waiting
running
review
waving
jumping
failed
running-left
running-right
```

缺少某些状态也可以运行，Pet Bridge 会自动隐藏对应按钮和序列。
