# mPaaS 蚂蚁动态卡片 · ka文档

> 本文根据 mPaaS「蚂蚁动态卡片」公开文档抓取整理，作为 Skill 的**本地离线权威依据**（部署到内网不依赖联网，统一离线化）。
>
> - 抓取日期：2026-09-09
> - 文档版本：蚂蚁动态卡片使用指南 20250303 / 20250227（组件定义），页面更新 2025-11-17
> - 官方文档总入口：https://help.aliyun.com/zh/product/49548.html
> - 卡片语法：https://help.aliyun.com/zh/document_detail/341881.html
> - 卡片标签：https://help.aliyun.com/zh/document_detail/2997303.html
> - 通用样式：https://help.aliyun.com/zh/document_detail/2261151.html
> - 通用事件：https://help.aliyun.com/zh/document_detail/342778.html
>
> 对应 Skill 规则速查：**V1**（manifest）、**V2**（标签白名单）、**V3**（属性/事件白名单）、**V11**（CSS 单位 px/rpx）、**V16**（F2 图表）、**V22**（text/richtext 不可嵌套）。

---

## 一、工程结构（V1 相关）

一个卡片工程由根目录的 `.act.config.json` + 卡片目录下的源码文件组成：

```
.
├── dist                    // 编译产物目录（自动生成）
│   └── test_cube
│       ├── main.bin        // 产物二进制
│       ├── main.json       // 产物 JSON
│       ├── main.mock       // mock.json 编译产物
│       ├── main.js         // 产物 JS 逻辑段
│       └── main.zip        // 整包
├── test_cube
│   ├── main.vue            // 【必需】卡片源码，文件名不可改变
│   ├── mock.json           // 【可选】mock 数据
│   ├── manifest.json       // 【必需】编译配置，文件名不可改变
│   └── main.css            // 【可选】样式文件
└── .act.config.json        // 【必需】工程配置（"type": "templates"）
```

### manifest.json（V1）

| 字段 | 类型 | 说明 | 默认 |
|---|---|---|---|
| name | string | 卡片名称 | 后台 ID 为准 |
| version | string | 卡片版本 | 后台版本为准 |
| compilerType | number | 0=静态卡片；1=动态卡片（支持 JS，推荐） | 0 |
| jsformat | number | 0=表达式导出；1=IIFE 导出（支持 JS import，推荐） | 0 |

> 工程管理：https://help.aliyun.com/zh/document_detail/342772.html

---

## 二、卡片语法基础（单位 / 绑定 / 事件 / 逻辑渲染）

- **单位**：支持 `px` / `rpx`。rpx 用于等比缩放（750 基准设计稿）。→ V11
- **数据绑定**：`{{value}}`、`:prop="expr"` / `v-bind:prop`
- **事件绑定**：`@event="handler"` / `v-on:event`
- **逻辑渲染**：`v-if` / `v-else-if` / `v-else` / `v-for`
- 脚本：`data`（响应式数据）、`methods`（方法）、`get xxx()`（计算属性）、生命周期钩子（V8 白名单）
- 引用：相对路径 `import` 公共模块（V20）+ `.env.<env>` 环境配置（V21）

---

## 三、组件总览

蚂蚁动态卡片内置 6 个基础组件（官方"卡片组件"章节）。`cell` 作为 slider 子项。

| 组件 | 类别 | 用途 | 嵌套限制 |
|------|------|------|----------|
| `div` | 容器 | 区块/布局分区 | 可嵌套任何组件 |
| `text` | 文本 | 纯文本渲染 | **不可嵌套任何组件** |
| `image` | 媒体 | 单张图片 | 不可嵌套任何组件 |
| `external-richtext` | 文本 | HTML 富文本 | **不可嵌套任何组件** |
| `slider` | 容器 | 多图轮播 | 只能嵌套 `<cell>` 子组件 |
| `scroller` | 容器 | 内容滚动 | 可嵌任意组件；同向 scroller 不可嵌套 |

---

## 3.1 div

`<div>` 定义文档分区/区块，可把卡片拆成独立部分。支持通用样式全部。

- **嵌套**：可以嵌套任何其他组件。
- **属性**：无。
- **事件**：支持所有通用事件。

示例：
```
<div>
  <div class="box"></div>
</div>
.box { border-width:2px; border-style:solid; border-color:#BBB; width:250px; height:250px; }
```
来源：https://help.aliyun.com/zh/document_detail/341883.html

---

## 3.2 text

`<text>` 按指定样式渲染文本，只能包含**文本值**，可用 `{{}}` 插入变量值。

- **嵌套**：**不可嵌套任何其他组件。**（→ V22）
- **样式**：通用样式 + 特殊样式，见下。
- **属性**：`value`（文本内容）、`line-space`（行间距，长度单位）。
- **事件**：支持所有通用事件。

### 字体样式

| 属性 | 值类型 | 默认 | 可选 | 写法 |
|---|---|---|---|---|
| font-size | 长度单位 | 16px | - | `font-size:10px;` |
| font-weight | string | normal | normal/bold/100~900 | `font-weight:bold;` |
| font-style | string | normal | normal/italic | `font-style:italic;` |
| font-family | string | 平台默认 | - | `font-family:PingFangSC-Regular;` |

### 排版样式

| 属性 | 值类型 | 默认 | 可选 | 写法 |
|---|---|---|---|---|
| lines | int | 0(不限) | - | `lines:10;` |
| text-align | string | left | left/center/right | `text-align:center;` |
| text-overflow | string | clip | clip/ellipsis(单行) | `text-overflow:ellipsis;` |
| line-height | 长度+数值 | 0 | - | `line-height:12px;` |
| white-space | string | pre-wrap | normal/nowrap/pre/pre-wrap/pre-line | `white-space:nowrap;` |
| word-wrap | string | break-word | normal/break-word/anywhere | `word-wrap:break-word;` |
| word-break | string | 无 | normal/break-all/keep-all | `word-break:break-all;` |
| letter-spacing | string | 0 | - | `letter-spacing:5px;` |
| text-indent | string | 0 | - | `text-indent:30%;` |
| vertical-align | string | baseline | baseline/sub/super/top/bottom/middle/长度/百分比 | `vertical-align:middle;` |

### 效果样式

| 属性 | 值类型 | 默认 | 可选 | 写法 |
|---|---|---|---|---|
| color | 色彩单位 | 0x000000 | - | `color:#333;` `color:rgb(255,0,255);` |
| text-decoration | string | none | underline/none/line-through/overline | `text-decoration:underline;` |
| text-shadow | 长度&色彩 | - | `${x} ${y} ${size} ${color}`（x/y 必需） | `text-shadow:2px 2px 3px gray;` |
| text-shadow-color | 色彩单位 | 同 color | - | `text-shadow-color:blue;` |
| text-shadow-offset | 长度单位 | - | 必需 | `text-shadow-offset:2px 2px;` |
| text-shadow-radius | 长度单位 | 0 | - | `text-shadow-radius:3px;` |

### 与 Web 差异（要点）
- `word-wrap` 缺省 = break-word（Web 为 normal）
- 长词超出背景框时不区分中英混排
- `word-break:keep-all` 同 `normal`；`letter-spacing` 需 Android 5.0+

来源：https://help.aliyun.com/zh/document_detail/342782.html

---

## 3.3 image

`<image>` 渲染单张图片。

- **嵌套**：不可嵌套任何其他组件。
- **样式**：支持全部通用样式。
- **属性**：

| 属性 | 值类型 | 默认 | 可选值 | 写法 |
|---|---|---|---|---|
| src | string | - | URL("https:") CDN / URL("./") 离线包 / URL("data:") Base64 | `src="https://..."` |
| resize | string | stretch | stretch/cover/contain/top/bottom/center/left/right/top left/top right/...；超出默认 cover | `resize="contain"` |
| placeholder | string | - | CDN 地址 / Base64 | `placeholder="..."` |

- **事件**：支持所有通用事件。

示例：
```
<image class="image" resize="contain" src="https://...jpg"></image>
```
**说明**：`<image>` 不支持 SVG 格式；`resize` 非 cover/contain/stretch 或无 width/height 时下载原图。
来源：https://help.aliyun.com/zh/document_detail/342783.html

---

## 3.4 richtext（external-richtext）

`<external-richtext>` 渲染 HTML 富文本。→ V2 已放行、V22 检测不可嵌套。

- **嵌套**：**不可嵌套任何其他组件。**
- **样式**：支持全部通用样式 + 部分特殊样式。
- **支持 HTML 标签**：br、span、div、b、del、h1~h6、i、p、img、a
- **行内样式**：font-size、color、font-weight、font-family
- **属性（DSL）**：

| 属性 | 描述 | 值类型 | 默认 | 写法 |
|---|---|---|---|---|
| text | 文本内容（HTML 字符串） | string | - | `<external-richtext text="..."></external-richtext>` |
| line-space | 行间距 | 长度单位 | - | `line-space="4px"` |
| detectEmotionEmoji | 检测自定义 emoji | 1/0 | 0 | `detectEmotionEmoji="1"` |
| linkColor | 链接(a)颜色 | 色彩单位 | 0xff108ee9 | `linkColor="#FF0000"` |
| highlightedColor | 链接点击高亮色 | 色彩单位 | 0xffa9a9a9 | `highlightedColor="#0000FF"` |

- **事件**：支持所有通用事件。
示例：
```
<external-richtext :text="richTextContent" :line-space="4px"></external-richtext>
```
来源：https://help.aliyun.com/zh/document_detail/342784.html

---

## 3.5 slider

`<slider>` 在一个视图中交替展示多个图片（轮播）。

- **嵌套**：只能嵌套 `<cell>` 子组件（`cell` 定义子列表项，引擎对 cell 做内存回收提升性能）。
- **样式**：通用样式**部分不支持**：盒子模型 padding、布局 flex 容器/成员、背景 background-image、hover、动画。
- **属性**：

| 属性 | 值类型 | 默认 | 写法 | 备注 |
|---|---|---|---|---|
| auto-play | boolean | true | `auto-play="true"` | 自动轮播 |
| interval | number | 500ms | `interval="500"` | 自动轮播间隔；<500ms 按 500ms 处理 |
| infinite | boolean | true | `infinite="true"` | 是否循环 |
| show-indicators | boolean | false | `show-indicators="true"` | 显示指示器 |
| scrollable | boolean | true | `scrollable="true"` | 手势滑动切换 |
| index | number | 0 | `index="2"` | 显示第几个页面 |
| previous-margin | 长度单位 | 0 | `previous-margin="200px"` | 透出前一页；不能与 infinite=true 同用 |
| next-margin | 长度单位 | 0 | `next-margin="200px"` | 透出后一页；不能与 infinite=true 同用 |

- **事件**：不支持通用事件，特定事件 `on-change`（index：当前展示图片索引）。

示例：
```
<slider class="testSlider" :index="index" show-indicators="false" auto-play="true" @on-change="onChange(index)">
  <cell class="cell" v-for="(item, i) in imageList">
    <image class="image" resize="contain" :src="item.src"></image>
  </cell>
</slider>
```
来源：https://help.aliyun.com/zh/document_detail/418472.html

---

## 3.6 scroller

`<scroller>` 是容纳子组件横向/竖向滚动的容器，适合长列表。

- **嵌套**：支持任意组件嵌入。**重要：同方向的 scroller 不可嵌套使用。**
- **样式**：通用样式**部分不支持**：padding、flex 容器/成员、background-image、hover、动画。
- **属性**：

| 属性 | 值类型 | 默认 | 可选 | 写法 |
|---|---|---|---|---|
| show-scrollbar | boolean | false | - | `show-scrollbar="true"` |
| scroll-direction | string | vertical | vertical/horizontal | `scroll-direction="horizontal"` |
| upper-threshhold | string | 50px | - | `upper-threshhold="50px"` |
| lower-threshhold | string | 50px | - | `lower-threshhold="50px"` |
| offset-accuracy | string | 10px | - | `offset-accuracy="10px"`（滚动 callback 频率） |
| allow-bounce | boolean | false | - | `allow-bounce="true"`（10.2.28+） |
| always-bounce | boolean | false | - | `always-bounce="true"`（需 allow-bounce=true；10.2.28+） |

- **事件**：不支持通用事件，特定事件：

| 事件 | 触发 | 参数 |
|---|---|---|
| on-scroll | 滚动中 | contentSize / contentOffset |
| on-scrollstart | 滚动开始 | contentSize / contentOffset |
| on-scrollend | 滚动结束 | contentSize / contentOffset |
| on-scrolltoupper | 距顶部/左部小于阈值 | - |
| on-scrolltolower | 距底部/右部小于阈值 | - |

示例：
```
<scroller class="root" scroll-direction="horizontal" @on-scroll="onScroll()" @on-scrolltoupper="onScrollToUpper()" @on-scrollend="onScrollEnd()">
  <text class="message" :value="message" @click="onClick()"></text>
  <image class="image" src="..."></image>
</scroller>
```
来源：https://help.aliyun.com/zh/document_detail/429809.html

---

## 四、组件与 Skill 规则映射

| Skill 规则 | 对应点 |
|---|---|
| **V1 manifest** | manifest.json / .act.config.json 结构（compilerType/jsformat） |
| **V2 标签白名单** | 内置组件 div/text/image/external-richtext/slider/scroller(+cell)；已放行 `external-richtext` |
| **V3 属性白名单** | text value/line-space、image src/resize/placeholder、slider/scroller 属性、`on-*` 事件 |
| **V11 CSS 单位** | 全部属性/样式均用 px 或 rpx，仅支持 px/rpx |
| **V16 F2 图表** | F2 图表为扩展能力，非内置组件 |
| **V22 不可嵌套** | text / external-richtext 不可嵌套任何组件 |

> 说明：官方内置基础组件即上表 6 个。`input`/`a`/`span`/`list` 等若出现在白名单，属于项目侧按需放行的扩展，非蚂蚁动态卡片内置组件范畴。