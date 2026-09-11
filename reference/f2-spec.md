# 阿里 F2 图表规范 · 官方文档归档

> 阿里 F2 是 AntV 团队为移动端打造的图表可视化引擎，本文档是其官方文档的离线归档，
> 用于本 Skill 部署到内网后无需联网查阅。对应 Skill 规则：**V16**（F2 图表 props 校验）。
>
> - 抓取日期：2026-09-10
> - 文档版本：F2 4.x（声明式 JSX 语法）
> - 官方入口：https://f2.antv.antgroup.com/
> - 当前文档路径：https://f2.antv.antgroup.com/en/tutorial/*
> - 安装：`npm install @antv/f2`
> - CDN：`https://unpkg.com/@antv/f2/dist/index.min.js`

---

## 一、Quick Start（快速上手）

F2 4.x 起改用**声明式 JSX 语法**，需配置 JSX 转换工具（与 React 集成方式相近）。

```
import { Canvas, Chart, Axis, Interval, Tooltip } from '@antv/f2';

const data = [
  { genre: 'Sports', sold: 275 },
  { genre: 'Strategy', sold: 115 },
  { genre: 'Action', sold: 120 },
  { genre: 'Shooter', sold: 350 },
  { genre: 'Other', sold: 150 },
];

const context = document.getElementById('myChart').getContext('2d');
const { props } = (
  <Canvas context={context} pixelRatio={window.devicePixelRatio}>
    <Chart data={data}>
      <Axis field="genre" />
      <Axis field="sold" />
      <Interval x="genre" y="sold" color="genre" />
      <Tooltip />
    </Chart>
  </Canvas>
);
const canvas = new Canvas(props);
canvas.render();
```

来源：https://f2.antv.antgroup.com/en/tutorial/getting-started

---

## 二、Core Concepts（核心概念）

### 2.1 图表结构

```
Canvas（画布容器）
 └── Chart（图表核心）
      ├── Axis（坐标轴）
      ├── Geometry（几何标记，决定图表类型）
      ├── Tooltip（提示）
      ├── Legend（图例）
      └── Guide（辅助标记）
```

### 2.2 核心术语

| 术语 | 英文 | 描述 |
|------|------|------|
| 坐标轴 | Axis | x/y（笛卡尔）或角度/半径（极坐标）；由轴线、刻度线、标签、网格组成 |
| 图例 | Legend | 标识数据类别，辅助读图、过滤 |
| 几何标记 | Geometry | 点/线/面等，决定图表类型（条形/折线/散点等） |
| 图形属性 | Attribute | 视觉通道：position/color/size/shape |
| 坐标系 | Coordinate | 两个 position scale 组合，描述数据如何映射到图形平面 |
| 提示 | Tooltip | 鼠标悬停时显示数据 |
| 辅助标记 | Guide | 警示线、最大值线、高亮区域 |

### 2.3 组件 API

#### Canvas — 画布容器（根容器）

| Prop | 类型 | 默认 | 描述 |
|------|------|------|------|
| `context` | CanvasRenderingContext2D | - | **必需**，Canvas 2D context |
| `pixelRatio` | number | window.devicePixelRatio | 设备像素比 |
| `width` | number | - | Canvas 宽 |
| `height` | number | - | Canvas 高 |
| `animate` | boolean | true | 是否启用动画 |
| `children` | ReactNode | - | 子组件 |

#### Chart — 图表核心（数据处理 + 坐标变换）

| Prop | 类型 | 默认 | 描述 |
|------|------|------|------|
| `data` | `Data[]` | - | **必需**，数据源（JSON 数组） |
| `scale` | `ScaleConfig` | - | Scale 配置 |
| `coord` | `CoordConfig` | - | 坐标系配置 |
| `children` | ReactNode | - | 子组件 |

#### Geometry — 几何标记（决定图表类型）

| 几何标记 | 组件 | 图表类型 |
|----------|------|----------|
| Interval | `<Interval />` | 条形图 / 柱状图 |
| Line | `<Line />` | 折线图 / 曲线图 |
| Point | `<Point />` | 散点图 / 点图 |
| Area | `<Area />` | 面积图 |
| Candlestick | `<Candlestick />` | K 线图 |

示例：
```
<Interval x="genre" y="sold" color="genre" />     // 柱状图
<Line x="date" y="value" color="type" />          // 折线图
<Point x="weight" y="height" color="gender" />   // 散点图
```

#### 图形属性（Graphic Attributes）

| 属性 | 描述 | 示例 |
|------|------|------|
| `position` | 映射字段到 x/y 轴 | `x="genre", y="sold"` |
| `color` | 颜色（字段或函数） | `color="genre"` 或 `color={d => d.value > 100 ? 'red' : 'blue'}` |
| `size` | 大小（点尺寸、线粗等） | `size={10}` 或 `size={d => d.value}` |
| `shape` | 形状 | `shape="circle"` 或 `shape="hollowCircle"` |

#### 坐标系（Coordinate System）

| 类型 | 描述 | 配置 |
|------|------|------|
| rect | 笛卡尔坐标系（默认） | `<coord type="rect" />` |
| polar | 极坐标系 | `<coord type="polar" />` |

#### Scale 速览

详见「四、Scale」。通过 Chart 的 `scale` 属性传入。

#### 数据格式

JSON 数组，每项一个标准 JSON 对象：
```
const data = [
  { genre: 'Sports', sold: 275, year: 2023 },
  { genre: 'Strategy', sold: 115, year: 2023 },
  ...
];
```

来源：https://f2.antv.antgroup.com/en/tutorial/understanding

---

## 三、Data Processing（数据处理）

### 3.1 基本数据格式

JSON 数组，每项是普通对象。字段值支持 string/number/array/date 等。

```
const data = [
  { year: 2010, sales: 40 },
  { year: 2011, sales: 30 },
  ...
];

<Canvas context={context}>
  <Chart data={data}>
    <Line x="year" y="sales" />
    <Point x="year" y="sales" />
    <Tooltip />
  </Chart>
</Canvas>
```

### 3.2 特殊图表数据格式

#### 饼图（**必须含常量字段，且为 string**）

饼图使用极坐标，所有数据要映射到同一角度范围。常量字段保证起点一致：
```
const data = [
  { name: 'Movie A', percent: 0.4,  a: '1' },
  { name: 'Movie B', percent: 0.2,  a: '1' },
  { name: 'Movie C', percent: 0.18, a: '1' },
  ...
];

<Chart data={data} coord={{ type: 'polar' }}>
  <Interval x="a" y="percent" color="name" coord="polar" />
</Chart>
```

#### 区间柱状图

x/y 轴数据为数组时，自动映射为区间 `[最小值, 最大值]`：
```
const data = [
  { x: 'Cat 1', y: [76, 100] },
  { x: 'Cat 2', y: [56, 108] },
  ...
];

<Chart data={data}>
  <Interval x="x" y="y" />
</Chart>
```

#### K 线图

value 数组格式：`[open, close, lowest, highest]`
```
const data = [
  { date: '2023-01', value: [100, 110, 95, 120] },
  ...
];

<Chart data={data}>
  <Axis field="date" type="timeCat" />
  <Candlestick x="date" y="value" />
</Chart>
```

#### 散点图（气泡图）

可用 `size` 增加维度：
```
const data = [
  { x: 10, y: 20, size: 5,  category: 'A' },
  { x: 15, y: 25, size: 10, category: 'B' },
  ...
];

<Chart data={data}>
  <Point x="x" y="y" size="size" color="category" />
</Chart>
```

### 3.3 数据处理（filter/sort/aggregate/transform）

| 操作 | 方式 |
|------|------|
| 过滤 | `data.filter(item => item.category === 'A')` |
| 排序 | `[...data].sort((a, b) => b.value - a.value)` |
| 聚合 | reduce / forEach 按 key 求和 |
| 转换 | map：日期格式化、加派生字段 |

### 3.4 数据更新

```
let chart = new Canvas(props);
chart.render();

// 更新数据
chart.update(newProps);  // 自动触发动画
```

### 3.5 常见场景
- 空数据：显示 EmptyState
- 缺失值：`filter(item => item.sales != null)` 或 `?? 0` 填充
- 大数据集：前端采样 / 分页 / 服务端聚合

来源：https://f2.antv.antgroup.com/en/tutorial/data

---

## 四、Scale（度量）

Scale 是数据空间与图形空间的转换桥，把原始数据转成 `[0, 1]` 范围内的值。

### 4.1 Scale 类型

| 类型 | 描述 | 适用 |
|------|------|------|
| `identity` | 常量类型，字段不变 | 常量字段 |
| `linear` | 连续数字 | 连续数值 |
| `cat` | 分类 | 离散类别 |
| `timeCat` | 时间类型（默认排序） | 时间/日期 |

### 4.2 通过 Chart 的 `scale` 属性配置

```
<Chart
  data={data}
  scale={{
    a: { type: 'cat' },
    b: { min: 0, max: 100 },
  }}
>
  <Interval x="a" y="b" />
</Chart>
```

### 4.3 通用属性（所有 scale 都支持）

| 属性 | 类型 | 描述 |
|------|------|------|
| `type` | string | identity / linear / cat / timeCat |
| `formatter` | Function | 格式化刻度文本，影响轴/图例/提示 |
| `range` | Array | 输出范围，默认 `[0, 1]` |
| `alias` | string | 字段显示别名（英文转中文等） |
| `tickCount` | number | 刻度数量 |
| `ticks` | Array | 指定刻度文本 |

### 4.4 Linear Scale

| 属性 | 类型 | 描述 |
|------|------|------|
| `nice` | boolean | 优化数值范围让刻度均匀分布，默认 `true` |
| `min` | number | 最小值 |
| `max` | number | 最大值 |
| `tickInterval` | number | 刻度间隔（与 tickCount 互斥） |

类型定义：
```
interface LinearScaleConfig {
  type?: 'linear';
  min?: number;
  max?: number;
  nice?: boolean;
  tickCount?: number;
  tickInterval?: number;
  range?: [number, number];
  alias?: string;
  formatter?: (value: number) => string;
  ticks?: number[];
}
```

### 4.5 Cat Scale

| 属性 | 类型 | 描述 |
|------|------|------|
| `values` | Array | 指定分类值的顺序 |
| `isRounding` | boolean | 是否允许舍入满足均匀刻度，默认 `false` |

典型用法：
```
scale={{
  level: {
    type: 'cat',
    values: ['最低', '中等', '最高'],
  },
}}
```

`values` 用例：
- **指定分类顺序**
- **数字到分类映射（索引映射）**：用 month 值作索引，对应 values 数组的位置

### 4.6 TimeCat Scale

| 属性 | 类型 | 描述 |
|------|------|------|
| `nice` | boolean | 是否优化刻度 |
| `mask` | string | 时间格式，默认 `'YYYY-MM-DD'` |
| `sortable` | boolean | 是否排序，默认 `true`。预排序数据可设 `false` 提升性能 |
| `values` | Array | 指定时间值顺序 |

类型定义：
```
interface TimeCatScaleConfig {
  type?: 'timeCat';
  nice?: boolean;
  mask?: string;
  sortable?: boolean;
  tickCount?: number;
  values?: string[];
  range?: [number, number];
  alias?: string;
  formatter?: (value: string | Date) => string;
  ticks?: string[];
}
```

### 4.7 完整 ScaleConfig 类型

```
interface ScaleConfig {
  type?: 'linear' | 'cat' | 'timeCat' | 'identity';
  // 通用
  range?: [number, number];
  alias?: string;
  formatter?: (value: any) => string;
  tickCount?: number;
  ticks?: any[];
  // linear
  min?: number;
  max?: number;
  nice?: boolean;
  tickInterval?: number;
  // cat
  values?: any[];
  isRounding?: boolean;
  // timeCat
  mask?: string;
  sortable?: boolean;
}
```

### 4.8 常见问题
- **轴从 0 起**：`scale={{ value: { min: 0 } }}`
- **刻度间隔**：`tickInterval: 20`
- **自定义刻度标签**：`formatter` 或 `ticks`
- **预排序时间数据性能**：`sortable: false`
- **`mask` 与 `formatter` 同时设置**：**不生效**，以 `formatter` 为准

来源：https://f2.antv.antgroup.com/en/tutorial/scale

---

## 五、Coordinate System（坐标系）

### 5.1 类型

| 类型 | 描述 | 适用 |
|------|------|------|
| `rect` | 笛卡尔（默认），由两条垂直轴组成 | 柱状图/折线图/散点图 |
| `polar` | 极坐标，由角度 + 半径组成 | 饼图/玫瑰图/雷达图 |

切换方式：在 Chart 上设 `coord` 属性
```
<Chart data={data} coord={{ type: 'polar' }}>...</Chart>
```

### 5.2 笛卡尔坐标

```
<Chart coord={{ type: 'rect', transposed: false }}>
  <Interval x="genre" y="sold" />
</Chart>
```

`transposed: true` 翻转 x/y 轴，适用于条形图。

### 5.3 极坐标

```
<Chart
  coord={{
    type: 'polar',
    startAngle: -Math.PI,    // 可选
    endAngle: 0,             // 可选
    innerRadius: 0.3,        // 环形图：内半径
    radius: 1,               // 外半径
    transposed: false,
  }}
>
  ...
</Chart>
```

CoordConfig 类型：
```
interface CoordConfig {
  type?: 'rect' | 'polar';
  transposed?: boolean;
  startAngle?: number;   // polar 专用
  endAngle?: number;     // polar 专用
  innerRadius?: number;  // polar 专用
  radius?: number;       // polar 专用
}
```

### 5.4 极坐标默认角度

默认 `startAngle = -π`（9 点钟方向），`endAngle = 0`（3 点钟方向）。

### 5.5 典型图表

| 图表 | 配置 |
|------|------|
| 饼图 | `coord={{ type: 'polar' }}` + `<Interval x="a" y="percent" color="name" coord="polar" />` |
| 玫瑰图 | `coord={{ type: 'polar', transposed: true }}` |
| 环形图 | `coord={{ type: 'polar', innerRadius: 0.5 }}` |
| 半圆饼图 | `coord={{ type: 'polar', startAngle: -Math.PI/2, endAngle: Math.PI/2 }}` |
| 雷达图 | `coord={{ type: 'polar', radius: 0.8 }}` + Line/Point |
| 条形图 | `coord={{ type: 'rect', transposed: true }}` |
| 堆叠条形图 | `coord={{ type: 'rect', transposed: true }}` + `scale={{ sold: { stack: true } }}` |

来源：https://f2.antv.antgroup.com/en/tutorial/coordinate

---

## 六、与 Skill 规则 V16 的对应

V16 校验的是卡片中使用 `<F2Chart>` 时的 props 必填项。当前归档的官方规范确认：

| 组件 | 必填 prop | 说明 |
|------|-----------|------|
| `<F2Chart>` | `data` | **必需**，JSON 数组，每项为标准 JSON 对象 |
| `<F2Chart>` | `scale` | 推荐（按字段声明 scale 类型，否则自动推断） |
| `<F2Chart>` | `coord` | 可选（不写则默认笛卡尔 rect） |
| `<Interval />` | `x`, `y` | 必需，字段名 |
| `<Line />` | `x`, `y` | 必需 |
| `<Point />` | `x`, `y` | 必需 |
| `<Candlestick />` | `x`, `y` | 必需，y 字段数据为 `[open, close, lowest, highest]` |
| `<Axis />` | `field` | 必需，字段名 |
| `<Canvas />` | `context` | 必需，CanvasRenderingContext2D |

> 注：本 Skill 的 V16 规则检测的是更精简的"卡片版 F2" props 必填项（data 必填等），完整规范以本文档为权威依据。
> 数据格式核心要点：
> - **饼图必须含 string 类型的常量字段**
> - **K 线图 y 字段为 `[open, close, lowest, highest]`**
> - **区间柱状图 y 字段为 `[min, max]`**