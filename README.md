# 墨刃 · INK BLADE

水墨横版刀剑动作游戏。直接控制角色，以连斩开路，以弹反破势。Three.js / WebGL 2 渲染，独立的 60 Hz 战斗逻辑。

这是独立项目，与 `last-beacon` 同级，不依赖灯塔的代码、资源或启动服务。

## 本地运行

```sh
git clone git@github.com:stackloomdev/ink-blade.git
cd ink-blade
npm run dev
```

打开 **http://localhost:4174/**。项目没有需要安装的 npm 依赖；Three.js 随源码保存在本地。

```sh
npm test        # 战斗回归
npm run build   # 生成独立静态站点 dist/
```

`dist/` 可由普通静态 HTTP 服务托管。不使用服务器端接口；不能直接双击 HTML 以 `file://` 运行 ES modules。

## 已实现

- 三段竹林遭遇战：斗笠刀客、长枪兵。
- 白袍剑客三阶段：持剑对招、收鞘拔刀、破门。卷首可直接挑战；抵达 Boss 后重试从 Boss 开始。
- 三连斩、挑空、主动跳起追击、下劈、带短暂无敌的冲刺。
- 有方向要求的格挡与精准弹反、自身与敌方架势、破势处决。
- 攻击与精准弹反积累墨势，主动释放墨影连斩。
- 主角与白袍剑客依据用户三视图重塑：脸部和服装纹理通过 UV 映射到三维网格；宽袖、分片长袍、发束与挂饰可动，长衣摆对腿部做近似避让。
- 依据武器设定分别实现主角弯刀、黑鞘、红穗，以及 Boss 直剑、剑冠、白色长带；斗笠保留给普通刀客。
- 手脚目标驱动关节、地面步态、蓄势与收势、分片袍摆和飘带跟随、真实刀路与当前姿态的残影。
- 冷灰雨夜竹林、月色与远山、地面水波、局部断竹、击杀墨迹、第三阶段寺门破坏。
- 命中姿势与战斗判定对齐，真实刀路、重击火花、弹反冲击与雨水排开；朱红绝技、克制的镜头和墨色后期。
- Web Audio 分层合成雨声、挥刀、命中、钢铁碰撞与低鼓音，关键命中压低雨声。
- 暂停、失焦暂停、招式说明、失败重试、通关统计、基础触屏操作。

当前是可玩的风格化原型。角色为程序生成模型，尚未使用手工雕刻模型或动作捕捉；触屏需要继续真机调试，尚无手柄、跨设备存档、额外地图或装备成长。

## 角色参考与下一批素材

[素材清单及生成提示词](docs/ASSET-BRIEF.md) 记录已收到的六张原图、当前模型与交接规格。主角三视图、刀/刀鞘和 Boss 三视图已经齐全，不必重复生成；后续主要补斗笠刀客和长枪兵设定。

可编辑模型：[主角 GLB](assets/models/hero-reference-blockout.glb) / [Blender](assets/models/hero-reference-blockout.blend)，[白袍剑客 GLB](assets/models/white-swordsman-reference.glb) / [Blender](assets/models/white-swordsman-reference.blend)。包含嵌入贴图、分层网格与关节父子结构，尚无蒙皮骨骼和动画片段；实战动作与布料由代码驱动。生产构建包含六张用于纹理的参考图，不包含开发检视工具和导出模型文件。

## 操作

| 操作 | 按键 |
| --- | --- |
| 行走 / 转向 | A / D，或左右方向键 |
| 三连斩 | 连续按 J |
| 挑空 | W + J |
| 跳跃 / 空中追斩 | Space / 空中 J |
| 下劈 | 空中 S + J |
| 冲刺 | Shift |
| 格挡 / 精准弹反 | K；命中前短窗口按下精准弹反，按住仅持续格挡 |
| 处决 / Boss 破势反击 | 敌人出现「破」时靠近按 L |
| 墨影连斩 | 墨势满后按 Q |
| 暂停 / 声音 | Esc 或 P / M |

## 免费资源与运行

运行不调用 AI、付费服务或第三方素材 CDN，不需要账号和 API Key。场景、网格、动作与音效由代码生成，人物纹理使用用户提供的图片；没有使用付费模型、Spine 或外购音效。浏览器必须支持 WebGL 2。

`vendor/three.module.js`、`vendor/three.core.js` 来自 npm 官方包 **three@0.186.0**，按 MIT 许可证分发，许可证保存在 `vendor/THREE-LICENSE.txt`。游戏源码采用 MIT 许可证。

开发工具的 `tools/vendor/GLTFExporter.js` 同样来自 three@0.186.0，仅修改本地导入路径；不进入生产构建。用户提供的参考图保留原有权利，不由项目源码许可证重新授权。

## 代码结构

- `src/combat.js`：固定步长战斗、招式、架势、敌人 AI、Boss 阶段、关卡与结算。
- `src/warrior.js`：三维人物建模、关节动作、布料、刀路与残影。
- `src/reference-art.js`：原始三视图纹理加载与部位 UV；不修改原图。
- `src/reference-weapons.js`：按武器图构建弯刀、直剑、刀鞘、护手和剑穗。
- `src/scene.js`：Three.js 光照、粒子、刀光、人物与镜头协调。
- `src/ink-world.js`：雨夜山林、寺门、湿地面、雾与可破坏竹子。
- `src/ink-post.js`：水墨后期、弹反冲击与绝技色彩。
- `src/main.js`：键盘 / 触屏输入、HUD、菜单与暂停。
- `src/audio.js`：浏览器合成音效。
- `tests/combat.test.mjs`：战斗回归，包括正常数值的完整战役验证。
- `tools/character-study.html`：角色检视，可单独放大、切换正侧背视角、定位命中帧与导出 GLB；不进入生产构建。
- `tools/export-hero.js`、`tools/prepare-model.py`：从游戏模型导出 GLB 并在独立 Blender 进程中生成可编辑底稿。

运行开发服务后，可通过 **http://localhost:4174/tools/character-study.html** 放大检查人物。
浏览器开发检查可只读访问 `window.inkBlade`，没有修改生命、位置或墨势的接口。

## 本次验证（2026-09-10）

- 独立项目 `npm test`：13 项全部通过；`npm run build` 通过。
- 三视图版生产构建 `/dist/`，Codex 内置浏览器用正常按键跑通竹林与三阶段 Boss：42 连斩、3 次精准弹反、结束生命 100，未修改生命、伤害或墨势；包含跳跃、空中斩、下劈、挑空、冲刺、绝技和处决。
- 本轮采样 2,179 个显示帧：帧间隔中位数 16.7 ms，95 分位 17.5 ms。仅代表当前设备和本次短时运行，浏览器未记录到异常。
- 验证六张源图与构建中的文件逐字节相同，GLB 嵌入贴图可在 Blender 直接导入。
- 三视图版主角、Boss 的六种攻击均已检查，纹理成功加载，刀尖坐标正常。
- 两个新 GLB 均通过 Blender 导入：主角 172 个网格 / 27,186 个三角面，Boss 176 个网格 / 27,326 个三角面；贴图已嵌入，无蒙皮和动画片段。
- Safari、手机真机与手柄未验证。
