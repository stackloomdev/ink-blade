# 《墨刃》原画还原与素材交接

## 当前采用的方式

主角与白袍剑客使用原图驱动的 2.5D 分层动画。脸、头发、服装纹理、饰品和武器从用户原始 PNG 中取样，没有重新设计五官、重新画服饰，或把纹理投射到低精度三维头模上。场景和普通敌人继续由 Three.js 渲染。

角色使用无光照材质，在雨夜场景调色后单独合成。场景滤镜不会把脸部颜色、白袍或朱红系带改变成另一套配色。普通攻击保持白刃，绝技使用朱红效果。

## 已收到的原始材料

六张图片原样保存在 `assets/reference/turnarounds/`；该目录的 `manifest.json` 记录尺寸、字节数和 SHA-256。

| 文件 | 实际用途 |
| --- | --- |
| `hero-front.png` | 卷首主角立姿、正面原画对照 |
| `hero-side.png` | 主角侧面、实战身体 / 手臂 / 腿 / 衣摆与发束 |
| `hero-back.png` | 主角背面原画对照 |
| `hero-weapons.png` | 原刀刃、握柄、黑鞘、红穗 |
| `boss-front.png` | 白袍剑客正面原画对照 |
| `boss-side-back.png` | Boss 侧面 / 背面、实战分层、直剑与剑鞘 |

造型材料已经齐全，**不需要重新生成主角、Boss 或武器三视图**。

## 透明轮廓与动作

源 PNG 不变，透明覆盖率独立存储到 `assets/rig/coverage/`。轮廓由本机 Apple Vision 提取，使用无损 ICV1 行程编码。浏览器只读取静态文件，不会执行识别或访问生成服务。

制作时重新生成轮廓：

```sh
swift -module-cache-path /tmp/ink-swift-cache tools/reference-coverage.swift
node tools/pack-coverage.mjs
```

仅制作步骤需要 macOS 14+ 的本机 Vision；游玩没有此依赖。API 依据：[Apple Vision 前景轮廓请求](https://developer.apple.com/documentation/vision/vngenerateforegroundinstancemaskrequest)、[高分辨率轮廓](https://developer.apple.com/documentation/vision/vninstancemaskobservation/generatescaledmaskforimage(forinstances:from:))。

`src/art-rig-data.js` 记录原图坐标中的剪裁区域、骨架锚点与武器轮廓。`src/art-warrior.js` 驱动手臂逆向运动学、握刀位置、前后腿、衣摆和发束。被手臂遮住的少量服装区域使用邻近的原图服装作衬层；它们属于新姿势的拼接内容，不是源图中已经画出的可见细节。

正侧背是三份真实原图视图，不伪装成可绕任意角度观看的完整三维模型。战斗使用侧面，朝右时镜像。旧 GLB / Blender 底稿保留在 `assets/models/`，已退出主角和 Boss 的渲染路径。

## 验收范围

在 `/tools/character-study.html` 中，“原画立姿”将原图与实际 `ArtWarrior` 并排显示；选正、侧、背可逐一对照。动作按钮切换到同一实战骨架，可暂停、拖动时间和定位命中帧。

- 静态视图：原始 PNG 不改；实际渲染在原生分辨率下，不透明内部的 RGB 应逐像素一致。
- 发丝、衣摆和武器边缘：需要透明分割，半透明边界属于加工结果，不承诺逐像素相同。
- 战斗动作：保留原画身份与服饰细节，由分层骨架制作。三视图没有提供跑、砍、格挡的完整逐帧原画，不能声称这些新姿势是源素材的逐帧复刻。
- 命中：手掌与刀柄绑定，刀尖驱动轨迹，动作命中姿势对齐 `MOVES` 中的生效时间。

## 后续若继续统一整个游戏的画风

目前缺的是普通敌人的同风格设定：斗笠刀客、长枪兵，每人一张完整侧面人物，武器另列即可。现有程序模型继续可用。竹林、古寺的场景风格稿可作为后续增强，当前不阻塞游玩。

不需要先生成大量微小动作图集。用户早先提供的 `hero-direction.png` 保留为动作方向参考，里面的小帧没有用于冒充高清动画。若今后要求所有动作也严格对齐原画，需要按招式提供完整尺寸、固定视角与脚底基线的逐帧动作；这是另一种动画资产，而不是再画一遍三视图。

源素材保留用户原有权利；项目源码的 MIT 许可证不会对这些图片重新授权。
