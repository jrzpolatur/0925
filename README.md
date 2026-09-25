# THE FINALS · VOXEL STRIKE — 摩纳哥教堂 5v5 TDM

> Three.js / WebGL 网页第一人称射击原型
> **THE FINALS 核心战斗机制 + Minecraft / Pixel Gun 3D 体素美术 + 摩纳哥教堂周边战区 + 5v5 团队死斗**

进入页面 → 选择体型（LIGHT / MEDIUM / HEAVY）→ 进入摩纳哥教堂战区 → 与 4 名 AI 队友对抗 5 名 AI 敌人 →
射击、移动、技能、道具、破坏场景 → 命中/击杀金币反馈 → 死亡重生 → 持续 TDM。

---

## 1. 启动方法

```bash
npm install
npm run dev        # 开发服务器，默认 http://localhost:5173
```

生产构建 / 本地预览：

```bash
npm run build      # tsc --noEmit && vite build
npm run preview
```

其它命令：`npm run typecheck`（仅类型检查）。

**环境要求**：Node 18+、支持 WebGL2 的桌面浏览器（Chrome / Edge / Firefox）。目标测试硬件：Intel Iris Xe 核显。

---

## 2. 操作说明

| 输入 | 行为 |
|---|---|
| `W A S D` | 移动 |
| `SHIFT` | 冲刺（收枪、准星变大、FOV 外扩） |
| `SPACE` | 跳跃（支持空中控制） |
| 鼠标移动 | 视角（Pointer Lock） |
| 鼠标左键 | 射击（全自动按住连发 / 半自动点击；举起道具时为部署） |
| 鼠标右键 | ADS 开镜（FOV 收窄、精度提升）；举起道具时为部署 |
| `Q` | 使用体型技能（Dash / 震荡波 / 网格护盾） |
| `F` | 使用当前道具 |
| `G` | 举起 / 收起道具（举起后左键或右键即部署，HUD 有提示） |
| `R` | 换弹 |
| 鼠标滚轮 | 切换主 / 副武器 |
| `1` `2` | 直接选择武器槽 |
| `E` | 交互（乘坐 / 脱离滑索） |
| `V` | 第一人称 ⇄ 第三人称切换（网格护盾展开时效果最佳） |
| `ESC` | 暂停 / 继续 |
| `F3` | 性能面板（FPS / Draw Call / 三角面 / 破坏统计） |

---

## 3. 项目结构

```
src/
  core/
    Game.ts              主装配 + 主循环（固定步长物理 / 30Hz AI / 每帧渲染）
    Config.ts            全部可调参数（性能预算、移动、体型、比赛规则）
    Input.ts             键鼠输入 + Pointer Lock + 滚轮/边沿事件
    Types.ts             Intent / DamageInfo / RayHit / TeamId 等公共类型
    Utils.ts             数学工具、伪随机、对象池矩阵写入辅助

  renderer/
    RendererSetup.ts     WebGLRenderer / Scene / 相机 / 雾 / 固定光源（无实时阴影）

  physics/
    PhysicsWorld.ts      AABB 碰撞世界 + 宽相网格索引 + 射线 + 角色解算 + 体素单元注入

  map/
    VoxelBuilder.ts      MeshBuilder（顶点色 Box 合并）+ 共享体素材质
    MonacoChurchMap.ts   摩纳哥教堂战区（教堂 / 广场 / 街道 / 建筑群 / 屋顶 / 掩体 / 可破坏件）

  destruction/
    DestructionSystem.ts 体素破坏（单 InstancedMesh + DDA 射线 + 球形破坏 + 局部失效回调）
    DebrisPool.ts        碎片对象池（InstancedMesh、重力、地面反弹、生命周期回收）

  characters/
    Character.ts         战斗实体基类：玩家与 AI 共用同一套 update 逻辑
    CharacterModel.ts    Minecraft 风格体素角色（Head/Torso/ArmL/ArmR/LegL/LegR + 动画状态机）

  weapons/
    WeaponDefs.ts        武器数据表（新增武器只改这里 + 模型）
    Weapon.ts            武器运行时（射速 / 弹药 / 换弹 / ADS / 开火交给 CombatSystem）
    RecoilSystem.ts      独立后坐力（垂直上跳 + 水平扰动 + 固定偏移序列 + 回正）
    SpreadSystem.ts      动态扩散（腰射 / ADS / 移动 / 腾空 / 连射 bloom）
    WeaponModels.ts      5 把体素枪模（枪身/枪管/弹匣/瞄具/枪托/发光件）+ 第一人称视图模型

  abilities/
    Ability.ts           技能基类（CD / 状态 / 生命周期 / AI 入口）
    Dash.ts              三段积攒式闪避冲刺
    Shockwave.ts         震荡波（真实投掷物 → 爆炸冲量）
    MeshShield.ts        网格护盾（可切第三人称）
    AbilityFactory.ts    技能注册表

  gadgets/
    Gadget.ts            道具基类 + 数据表 + 部署点计算
    Mobility.ts          传送门 / 跳板 / 滑索
    Mines.ts             爆炸地雷 / 火焰地雷
    Deployables.ts       匿踪炸弹 / 球形护盾
    GadgetSystem.ts      所有部署物实体管理（护盾/地雷/力场/跳板/滑索/传送门 + 护盾射线）
    GadgetFactory.ts     道具注册表

  combat/
    CombatSystem.ts      统一射线/命中/伤害/衰减/爆炸物理（玩家与 AI 同一入口）
    Projectiles.ts       RPG 火箭 / 震荡波装置 / 匿踪炸弹（池化 + 子步碰撞）

  ai/
    Perception.ts        感知层（视野锥 + LOS 射线 + 记忆 + 集群计数）
    Navigation.ts        NavGrid + A*（8 邻域）+ 路径平滑 + 破坏后局部失效重算
    AIController.ts      HFSM 状态机 + Utility 战术选择 + 瞄准/移动/开火执行

  effects/
    FXSystem.ts          粒子池 / 曳光 / 枪焰 / 冲击环 / 爆炸 / 屏幕反馈接口
    CoinFX.ts            金币特效池（飞散 + 旋转 + 闪烁 + 回收）
    ElectricFX.ts        电击电弧（LineSegments 池 + 加色混合 + 每帧抖动）

  ui/
    HUD.ts               HP / 准星 / 命中反馈 / 受击方向 / 击杀播报 / 武器弹药 / 道具 / 技能 CD / 记分
    Menu.ts              体型选择菜单 + 暂停面板
    style.css            THE FINALS 风格 HUD 样式

  player/
    PlayerController.ts  第一/第三人称相机、ADS、后坐力反馈、相机防穿墙、道具模式

  audio/
    AudioManager.ts      程序化合成音效（枪声/爆炸/电击/跳跃/UI…）+ 距离衰减

  game/
    Loadout.ts           三种体型配置（HP / 速度 / 体积 / 武器 / 道具 / 技能）
    TDM.ts               5v5 计分 / 死亡 / 重生 / 时间 / 结算

  main.ts                入口
```

---

## 4. 核心系统实现要点

### 4.1 场景破坏（P1 核心）

* 所有可破坏物（墙、门、窗、木箱、路障、摊位、车辆、小型建筑结构）都由 **体素单元（cell）** 组成，
  **全部塞进同一个 `InstancedMesh`**，无论多少可破坏物都只有 1 个 Draw Call（当前地图 8182 个单元）。
* 单元格被摧毁 → 实例矩阵置零缩放 → 碰撞不再提供该格 → **玩家可以真正穿过炸开的洞**（不是换贴图）。
* 碰撞通过 `CellProvider` 接口注入 `PhysicsWorld`：破坏与移动/射线共用同一份数据，不存在"视觉炸开但仍有空气墙"。
* 射线用 **DDA（Amanatides–Woo）网格步进** 对体素求交，避免逐格 ray-box 测试；返回 `struct + cell`，
  因此子弹打墙也会逐格削减耐久（打凹痕 → 打穿）。
* 破坏来源：RPG 火箭、爆炸地雷、火焰地雷、震荡波、以及子弹的持续结构伤害。
* `DestructionSystem.onChange` 会把破坏区域推入 `Navigation` 的失效队列 → 导航网格局部重算 → **AI 能穿过新炸开的洞**。
* 碎片由 `DebrisPool` 池化（InstancedMesh + 重力 + 地面反弹 + 生命周期回收），容量固定，不产生 GC。

### 4.2 三种体型

| | LIGHT | MEDIUM | HEAVY |
|---|---|---|---|
| HP | 150 | 250 | 350 |
| 速度 | 7.4 | 6.3 | 5.2 |
| 体积 | 最矮最瘦 | 标准 | 最高最宽 |
| 武器 | XP-54 / 电击枪 | AKM / SA1216 | SA1216 / RPG-7 |
| 技能 | 闪避冲刺 | 震荡波 | 网格护盾 |
| 道具 | 传送门 / 匿踪炸弹 | 跳板 / 滑索 / 爆炸地雷 | 火焰地雷 / 球形护盾 |

**三段 Dash**：最多 3 层、每次消耗 1 层、独立层间冷却（不能无限连冲）、自动恢复、
方向由当前移动输入决定（AI 同样由 `intent.moveX/moveZ` 决定）、冲刺过程有速度曲线 + 拖影 + FOV 冲击 + 屏幕反馈。

**震荡波**：投掷一枚真实投射物（受重力），引爆时 `CombatSystem.explode()` 按 **中心 / 距离 / 方向 / Falloff**
计算施加到角色身上的 **Impulse**（`vel += dir * force`，并附带向上分量与 `stagger` 空中失衡）。
对可破坏体素额外造成 135 点结构伤害 —— 因此震荡波也能震碎墙体。玩家自己也会被真实推开。

**网格护盾**：独立的体素网格模型（纵横细条 + 淡色面板），有真实碰撞盒（带朝向的 OBB），
射线会先命中护盾并扣耐久、命中闪烁、耐久归零或 14 秒后消失。展开时按 `V` 可切第三人称。

### 4.3 射击系统

* **动态扩散**：`SpreadSystem` = 基础（腰射/ADS 插值）+ 移动（按水平速度比例）+ 冲刺惩罚 + 腾空惩罚 + 连射 bloom，
  停火后按 `decay` 回复。同一份数值同时用于真实弹道随机与 HUD 准星张开，所见即所得。
* **ADS**：右键收窄 FOV（78 → 62）、武器位移到视线中心、扩散骤降、后坐力不变但精度提升。
  开镜不使用任何全屏黑色遮罩，环境与 HUD 完全保留。
* **独立后坐力**：每把枪有自己的 `RecoilDef`（垂直上跳幅度、水平扰动、固定偏移序列、回正速度、相机抖动）。
  XP-54 高频小幅度；AKM 明显上跳 + 先右后左的偏移序列（可压枪）；SA1216 强烈后坐且射速低；RPG 单发强反馈。
  后坐力作用在 `Character.recoilPitch/Yaw`，**AI 瞄准同样叠加后坐力**，不存在"AI 无后坐"。
* **弹道**：`hitscan`（XP-54 / AKM / SA1216 / 电击枪）与 `projectile`（RPG-7，速度 52、重力 5.5）两条路径，
  都经过 `CombatSystem.raycastAll()`（世界 / 体素 / 护盾 / 角色）统一求交。
* **伤害衰减**：按距离在 `range` 区间内从 100% 衰减到 `falloffMin`，爆头有独立倍率，护盾单独扣耐久。
* **枪焰**：Billboard 平面池 + 固定数量点光源池（生命周期 0.055s，加色混合，`depthTest=false`），
  明亮短促，不遮挡准星与敌人；另有曳光弹（LineSegments 池）与抛壳（粒子）。

### 4.4 命中 / 击杀 / 受击反馈

* 命中：Hit Marker（爆头变金色加粗）+ 音效 + 少量金币洒落 + 火花。
* 击杀：Kill Feed（右上）+ 中央击杀字幕 + 大量金币爆散（CoinFX，一次 26 枚）+ 小型爆炸 + 击杀音效。
* 受击：按伤害方向显示屏幕方向箭头（相对玩家朝向实时换算）+ 红色边缘渐变 + 屏幕轻震 + 音效；
  血量低于 28% 时红色脉动。

### 4.5 道具与技能系统

统一的 `Ability` / `Gadget` 基类：独立类、CD、状态、使用逻辑、视觉反馈、声音接口、AI 调用接口。

| 类型 | 实现要点 |
|---|---|
| 传送门 | 入口在脚下、出口在准星落点，双向可穿；传送保留速度，带 1.1s 冷却与落点合法性校验（不会卡进墙） |
| 匿踪炸弹 | 真实投掷物（重力），落地生成 5.5m 匿踪力场，友军进入后模型透明 |
| 跳板 | 踩上去获得真实向上冲量（`addImpulse`），有使用次数与生命周期 |
| 滑索 | 部署线段，靠近按 `E` 乘坐，沿线段以 9.5m/s 真实移动，到终点自动脱离 |
| 爆炸地雷 | 敌方靠近触发真实爆炸（伤害 + 冲量 + 结构破坏 190） |
| 火焰地雷 | 触发后生成火焰区域，持续伤害 + 点燃（DoT） |
| 球形护盾 | 球形力场，射线可命中并扣耐久，阻挡子弹 |

---

## 5. AI 算法说明

AI 采用 **四层分层架构**，全部 AI（4 名队友 + 5 名敌人）与玩家使用**完全相同**的 `Character.update()`、
`Weapon.fire()`、`CombatSystem.fireWeapon()`、`Ability.activate()`、`Gadget.use()`。
AI 只写 `intent`（意图），不直接改血量、位置或伤害——**没有任何作弊式攻击或瞬移**。

### 第一层：感知系统（Perception，12Hz）

* 视野锥（FOV 145°，贴脸 6m 内无视视野锥）+ 距离 + **射线 LOS**（`Navigation.lineOfSight`）
* 视野外但最近被看到过的敌人保留 6 秒记忆（`lastSeen / lx / ly / lz`）
* 隐身状态（匿踪炸弹）会把有效发现距离压缩到 45%
* 统计 `clusterCount`（近距离敌人数），供 RPG / 震荡波做群体判断
* 只运行于 12Hz，不每帧计算

### 第二层：分层状态机 HFSM

```
Combat
├── search    无情报 → 前往地图争夺点（广场 / 教堂 / 街道），到达后轮换下一个
├── chase     有已知敌人但不可见 → 向最后已知位置推进
├── attack    可见且在射程内 → 保持理想交战距离 + 侧移（strafe）+ 点射
├── cover     中血量 → 用 findCover 找视线被遮挡的位置
├── retreat   低血量 / 被围攻 → 远离威胁 + 还击 + 机动道具
└── reload    弹药耗尽 / 低弹量且安全 → 边后撤边换弹
```

每个状态内部还有子行为：`UseGadget` / `UseAbility` / `Strafe` / `Jump` / `Ride zipline`，
由 Utility 层触发，不改变状态机主体结构。

### 第三层：战术选择（Utility AI，8Hz）

每次决策对所有候选行为打分，取最高分切换状态：

```
AttackScore  = 可见 && 在射程内 && 有弹 ? 70*(1 - dist/range*0.45) + 近距离加成 : 0
ChaseScore   = 可见 ? 26 : 42
CoverScore   = hp < 55% ? 44 : 0
RetreatScore = hp < 32% ? 62 : 0（被 ≥2 人围攻 +18）
ReloadScore  = 弹匣空 ? 95 :（弹量 < 22% 且距离远 ? 55 : 0）
SearchScore  = 12（无目标时的基线）
```

技能 / 道具（按体型与局势，非随机释放）：

| 角色 | 触发条件 | 行为 |
|---|---|---|
| Light | 近距离有敌 / 血量低 / 需要突进 | Dash（3 段，按输入方向） |
| Light | 距离 < 12m 且有弹 | 切电击枪（眩晕 1.7s + 电弧特效） |
| Light | 血量 < 55% | 匿踪炸弹 |
| Medium | 7m 内 ≥2 名敌人 或 敌人贴脸 < 5.5m | 震荡波（真实冲量推开） |
| Medium | 撤退 / 转移 | 跳板 或 滑索 |
| Medium | 敌人接近 3~16m | 爆炸地雷 |
| Heavy | 可见敌人 < 26m 或 血量 < 60% | 网格护盾 |
| Heavy | ≥2 名敌人聚集 或 距离 > 22m | 切 RPG-7 轰击（含破坏建筑） |
| Heavy | 敌人 < 14m | 火焰地雷 |
| 通用 | 血量 < 60% 或被压制 | 球形护盾 / 传送门撤离 |

### 第四层：导航（Navigation，3Hz）

* **NavGrid**：1.75m 网格，逐格采样"地面高度 + 2.1m 净空"，并对格心与四个偏移点做
  **0.62m 膨胀采样**（腐蚀处理），避免"格子可走但角色贴墙被碰撞挡住"的经典问题。
* **A\***：8 邻域 + octile 启发式 + 二叉堆开放列表 + 高度差惩罚（鼓励走平路）+ 斜向穿角检查。
* **路径平滑**：String Pulling，两点之间有 LOS 就跳过中间航点。
* **破坏联动**：`DestructionSystem.onChange → Navigation.invalidateArea()`，
  每帧限预算（220 格）局部重算，炸开的墙立刻变为可通行。
* **退化策略**：A* 失败 → 随机漫游点寻路 → 再失败 → 随机方向小步游走；
  同时有卡住检测（想动却没位移 → 跳跃 + 换向 + 立刻重新寻路 + 换争夺点），保证不会卡死或无限寻路。

### AI 决策频率

| 层 | 频率 |
|---|---|
| 渲染 | 每帧（显示器刷新率） |
| 物理 / 角色移动 | 固定 1/60（最多 4 子步） |
| AI 总体 tick | 30Hz |
| 感知 Perception | 12Hz |
| 战术决策 Utility | 8Hz |
| 导航 A* | 3Hz（卡住时立即触发） |

### AI 瞄准与开火

* 目标点取胸口偏上；对 RPG 做速度提前量；周期性叠加瞄准误差（技术水平越低误差越大）。
* 只有当枪口与目标夹角小于阈值、且过了反应延迟（0.14~0.44s，取决于 skill）才开火——不是"看到就锁头"。
* 全自动武器按 0.18~0.63s 的节奏点射（burst），停火间隙重新校准；半自动按射速节拍发 `firePressed` 沿。
* 弹匣为空自动进入 reload 状态；武器选择按距离与敌群数量切换（远 AKM / 近 SA1216 / 群敌 RPG / 贴脸电击枪）。

---

## 6. 性能优化说明

目标：Intel Iris Xe 核显上尽可能稳定高帧率。实测（软件渲染的无头环境，仅作上界参考）：
**81 Draw Call / 13.8 万三角面 / 92 个 Geometry**。

### 渲染

* **Instancing**：可破坏体素（8182 单元）、碎片、金币、粒子各 1 个 `InstancedMesh`，合计 4 个 Draw Call。
* **几何合并**：静态地图（600+ 方块）用 `MeshBuilder` 顶点色合并成 1 个 Mesh；
  每把枪、每个角色部件内部也是合并后的 Mesh。
* **共享材质**：全场景统一 `MeshLambertMaterial(vertexColors)`，除角色（需独立透明度）外共享同一实例。
* **无实时阴影**：`shadowMap` 关闭；用 Hemisphere + Directional + Ambient 三盏固定光源烘焙式打光，
  靠顶点色面朝向明暗制造体素块感。
* **固定光源数量**：爆炸/枪焰点光源为固定 4 盏的池（强度归零复用），
  避免动态增删光源触发 shader 重编译造成卡顿。
* **低分辨率纹理**：全部使用顶点色，零纹理、零贴图下载。
* **像素比钳制**：`setPixelRatio(min(devicePixelRatio, 1.75))`，`powerPreference: 'high-performance'`。
* **Frustum Culling** 默认开启（粒子/曳光等全屏对象关闭剔除并限制 `count`）。
* HUD 全部用 DOM 绘制，不占用 WebGL 预算。

### 物理与射线

* **XZ 均匀网格宽相索引**（4m 单元）：把射线/碰撞候选盒从 641 降到个位数，
  导航网格构建从 2166ms 降到 **597ms**（真实硬件约 150~250ms）。
* 所有碰撞数组预分配、复用，`query()` 结果写入复用数组，运行期零 `new`。
* 角色移动每帧固定 3 次轴分离解算（X → Z → Y），不做迭代收敛。
* 射线：体素用 DDA 网格步进；静态盒用宽相索引 + slab 法。

### AI

* 30Hz 主 tick，内部再分频到 12 / 8 / 3Hz；A* 单次扩展上限 2600 节点并带路径平滑。
* 感知先做水平距离剔除再算 LOS；LOS 复用物理射线。

### 粒子与对象池

* 粒子 1600、碎片 700、金币 420、曳光 96、投射物 28、电弧 14 条，全部预分配 + cursor 环形复用。
* 运行期不做 `new Particle()` / `new Mesh()`，死亡的池对象把实例矩阵置零缩放而非销毁重建。
* 到期实体（地雷/力场/护盾/跳板/滑索/传送门）主动 `dispose()` 几何与材质。

### 破坏系统

* 单 InstancedMesh + 槽位复用；摧毁单元格只改矩阵，不产生新对象。
* 破坏后的导航失效按队列每帧限预算重算（220 格/帧），避免一次性重算掉帧。
* 每帧 `mesh.count` 收敛到实际使用上限，避免处理空实例。

### CPU / GC

* 固定步长时间累加器（最多 4 子步），掉帧时不会雪崩。
* 高频计算全部使用模块级临时向量 / 类型化数组，避免每帧分配。
* 事件监听器只在 `Game` 构造时注册一次；重开比赛复用角色对象前会 `dispose()`。

---

## 7. 已知限制（真实完成度说明）

1. **导航为单层 2D NavGrid**：AI 主要在地面层活动，屋顶只能通过外挂楼梯 / 跳板到达，
   AI 不会主动规划多层立体路线（未实现多层 NavMesh / 体素跳跃链接）。
2. **音频为程序化合成**（WebAudio 振荡器 + 噪声），不是真实采样音频；接口 `AudioManager.play(name, pos, vol)`
   已完整预留，替换成真实音频资源只需改 `play()` 内部的分支。
3. **无实时阴影与后处理**：为保证 Iris Xe 帧率主动放弃（用顶点色明暗代替）。
   场景未使用 SSAO / Bloom 等后处理。
4. **AI 瞄准不是"人类级"**：技术水平、反应延迟、瞄准误差都是可调参数，
   行为以 Utility 打分为主，没有机器学习或行为树编辑器。
5. **武器动画为程序化**（位移/旋转/摆动），没有骨骼动画与 IK；换弹不拆弹匣动作（整体位移 + 计时条）。
6. **友军伤害关闭**：队友不会阻挡子弹也不受伤，但爆炸冲量仍会作用（避免队友互相卡位）。
7. **破坏不改变静态几何的视觉面**：静态建筑的上层结构不会因下层被炸而塌落（无结构承重模拟），
   破坏以"单元格消失 + 碎片"为准。
8. **单人本地对局**：没有网络同步，10 名角色全部在本地模拟。
9. **浏览器限制**：需要 Pointer Lock（部分浏览器要求 HTTPS 或用户手势），首次点击后音频才可用。

---

## 8. 验收对照

### 功能

- [x] 启动游戏 / 进入 5v5 TDM / 1 玩家 + 9 AI
- [x] 三种体型可选（LIGHT / MEDIUM / HEAVY，体积与数值不同）
- [x] XP-54 / AKM / SA1216 / RPG-7 / 电击枪（均为多段体素模型）
- [x] Dash（三段积攒）/ 震荡波（真实物理冲量）/ 网格护盾（可切第三人称）
- [x] 传送门 / 匿踪炸弹 / 跳板 / 滑索 / 爆炸地雷 / 火焰地雷 / 球形护盾
- [x] Q 技能（CD + UI）/ 鼠标滚轮切换 / 右键 ADS / 左键射击 / SHIFT 冲刺 / SPACE 跳跃 / R 换弹 / G 举起道具
- [x] 场景破坏（墙 / 门 / 窗 / 木箱 / 路障 / 摊位 / 车辆 / 小型结构）
- [x] 爆炸（闪光 + 火焰 + 烟雾 + 冲击波 + 碎片 + 屏幕反馈）
- [x] 命中 / 击杀 / 受击方向 / 金币特效 / Kill Feed / 记分板 / 重生 / 结算

### AI

- [x] 发现敌人（视野锥 + LOS + 记忆）/ 移动 / 开枪 / 换弹
- [x] 使用技能（Dash / 震荡波 / 网格护盾）
- [x] 使用道具（地雷 / 跳板 / 滑索 / 传送门 / 匿踪炸弹 / 球形护盾）
- [x] 使用 RPG / 按局势选武器
- [x] 与玩家共用同一套武器、技能、道具逻辑；不作弊瞬移（所有位移经过物理与导航）
- [x] 破坏后仍然能寻路（导航局部失效重算）

### 射击

- [x] 腰射 / ADS / 动态扩散 / 每把枪独立后坐力 / ADS 不遮挡视野 / 精细准星
- [x] 枪焰 / 曳光 / 抛壳 / 命中提示 / 受击提示 / 爽快反馈

### 特效

- [x] Hit Marker / Kill Feed / 击杀字幕 / 受击方向 / 命中金币 / 击杀金币
- [x] 爆炸 / 震荡波推力 / 电击电弧 / 枪焰 / 护盾受击闪烁

---

## 9. 扩展方式（模块化验证）

* **加一把枪**：`weapons/WeaponDefs.ts` 加一条数据 + `weapons/WeaponModels.ts` 加一个体素构建函数并注册；
  其余（射击、后坐、扩散、换弹、HUD、AI 选枪）全部数据驱动，无需改动。
* **加一个技能**：继承 `abilities/Ability.ts`，在 `AbilityFactory.ts` 注册，
  在 `game/Loadout.ts` 里挂到对应体型；AI 侧在 `AIController.maybeUseAbility()` 加一条触发条件。
* **加一个道具**：继承 `gadgets/Gadget.ts`，在 `GadgetFactory.ts` 注册，
  如需实体则在 `GadgetSystem.ts` 增加实体类型与更新逻辑；AI 侧在 `maybeUseGadget()` 加条件。
