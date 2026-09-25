/** 全局可调参数（性能 / 手感 / 平衡集中在这里，便于调参与后续扩展） */
export const CFG = {
  // ---------- 时间步 ----------
  fixedStep: 1 / 60,
  maxSubSteps: 4,
  maxFrameDt: 0.1,

  // ---------- 物理 ----------
  gravity: -26,
  stepHeight: 0.62,
  airControl: 0.32,
  groundFriction: 11,
  airFriction: 0.6,
  terminalVelocity: -55,

  // ---------- 移动手感 ----------
  accelGround: 62,
  accelAir: 18,
  jumpSpeed: 8.2,
  /** Dash 冲量（m/s） */
  dashSpeed: 17,
  dashDuration: 0.22,
  dashCharges: 3,
  dashRecharge: 3.2,
  dashCooldown: 0.55,

  // ---------- 战斗 ----------
  headshotMult: 1.75,
  respawnDelay: 5.0,
  matchDuration: 480, // 8 分钟
  scoreTarget: 30,    // 达到该击杀数比赛结束
  hitCoins: 3,
  killCoins: 26,

  // ---------- 性能：分频 Tick ----------
  tick: {
    /** AI 感知频率 Hz */
    perception: 12,
    /** AI 决策频率 Hz */
    decision: 8,
    /** 导航重算频率 Hz */
    navigation: 3,
    /** 物理/移动 = 每帧固定步 */
  },

  // ---------- 性能：粒子预算 ----------
  budget: {
    particles: 1600,
    debris: 700,
    coins: 420,
    tracers: 96,
    lights: 8,
  },

  // ---------- 渲染 ----------
  render: {
    fov: 78,
    adsFov: 55,
    near: 0.08,
    far: 420,
    fogNear: 60,
    fogFar: 300,
    pixelRatioCap: 1.35,
  },

  // ---------- 队伍配色 ----------
  teams: [
    { id: 0, name: 'BLUE', color: 0x3fa9f5, css: '#3fa9f5' },
    { id: 1, name: 'RED', color: 0xff4d55, css: '#ff4d55' },
  ],
} as const;
