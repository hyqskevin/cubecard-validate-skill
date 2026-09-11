# mPaaS 蚂蚁动态卡片 · 样式文档

> 本文根据 mPaaS「蚂蚁动态卡片」公开文档【样式】板块逐页抓取整理，作为 Skill 的**本地离线权威依据**（部署到内网不依赖联网，统一离线化）。
>
> - 抓取日期：2026-09-10
> - 文档版本说明：页面更新于 2025-11-17（各子页更新时间 2025-11-17 17:20:45~17:21:21）
> - 官方入口：https://help.aliyun.com/zh/document_detail/341884.html
>
> 对应 Skill 规则速查：**V11**（CSS 单位 px/rpx）、**V3**（属性白名单）、**V22**（text/richtext 不可嵌套）。

---

## 一、样式语法

来源：https://help.aliyun.com/zh/document_detail/342864.html

在模板模式下，页面样式相关 CSS 放置于 `<style></style>` 段内，`<style></style>` 段内支持的样式由 **通用样式**（`2261151`）决定。

模板模式 `<template></template>` 段内推荐通过 `class` 对样式进行设置，例如 `<text class="mytext">`。

### CSS 选择器

支持 **class、id、type** 三类选择器，**不支持父子、状态等更复杂的组合**。三类示例如下：

```
// class
.class {
}

// id
#id {
}

// type
div {
}
```

### 内联样式

模板模式提供运行时样式注入能力，主要通过组件的内置属性 `style` 字段实现。书写规范同前端流行框架（VueJS 和 ReactJS）一致，同时支持绑定和非绑定两种格式。

- **绑定内联样式**
  - 待绑定的样式字段应统一收敛至一个 JSONObject 内。
  - 待绑定的样式字段的 KEY 应符合驼峰命名规范（如 `background-color` 应转换为 `backgroundColor`）。
- **非绑定内联样式**
  - 待绑定的样式字段应按照 CSS 的书写规范收敛至一个字符串内。
  - 待绑定的样式字段的 KEY 应按照 CSS 规范单词间通过连字符 `-` 进行拼接（如 `background-color`）。

**样式优先级从高至低依次为：inline style、id、class、type。**

```
// main.vue
<template>
 <div class="root">
 <div class="div1" :style="style"></div>
 <div class="div2" style="width: 100px; background-color: blue"></div>
 </div>
</template>

// mock.json
{
 "style": {
 "height": "100px",
 "backgroundColor": "red"
 }
}
```

模板在内联样式上接收的属性值是一个 JS object：

```
<div class="root" :style="{height: height}"> // 上文示例
```

### 动态绑定 class

组件的 CSS 样式，可以动态绑定不同的选择器（selector）。

```
<div :class="mydiv">
```

### 媒体查询 @media

模板模式中引入 CSS 规范内的媒体查询能力，主要用于移动端 UI 适配。相对于 CSS 规范，模板模式支持的媒体查询能力有限。媒体查询相关信息可参考[@media 介绍](https://developer.mozilla.org/zh-CN/docs/Web/CSS/@media)。

- **媒体类型**：无需填写，默认使用 `all`。

| 媒体类型 | 是否支持 |
|---|---|
| all | 是 |
| screen | 否 |
| print | 否 |
| speech | 否 |

- **媒体特性**：卡片中媒体特性主要以固件特性为基础进行设计，这点同前端浏览器不同。

| 媒体特性 | 取值 | 说明 |
|---|---|---|
| platform | ios \| android | 针对平台适配，使用时同 CSS 规范有所区别，@media 后直接设置平台值即可，例如 `@media android`。 |
| support | safearea | 针对 iOS 平台屏幕安全区域适配。 |

- **媒体运算符**

| 运算符 | 是否支持 |
|---|---|
| and | 是 |
| not | 否 |
| only | 否 |

结合 CSS 特性与 @media 媒体查询能力进行样式适配的示例：

```
<template>
 <div class="banner"></div>
</template>
<style>
    @media android {
 .banner {
 width: 100px;
 height: 100px;
 background-color: #00fff0;
 }
 }
 @media ios and (support: safearea) {
 .banner {
 width: 100px;
 height: 100px;
 background-color: #00fafb;
 }
 }
 .banner {
 width: 100px;
 height: 100px;
 background-color: green;
 }
</style>
```

### 样式导入

导入样式之前，先了解两种不同类型的样式：

- **导入样式**：存在于 `.css` 文件中的可供统一管理、导入的样式。
- **限定样式**：存在于 `.vue` 文件中 `<style></style>` 段内仅作用于本模板的样式。

语法格式：

```
<style src="[.css文件相对路径]" />
```

文件结构：

```
.
└── template_name // 模板文件夹（以模板ID命名）
 ├── main.vue // 模板布局、样式描述文件
 ├── manifest.json // 模板配置文件
 └── mock.json // 模板可供绑定的测试数据
 └── common.css // 模板公共样式文件
```

模板代码：

```
<template>
 ... [模板布局相关描述]
</template>

<style src="./common.css" />

<style>
 ... [仅作用在本模板内的样式]
</style>
```

**层叠规则**：模板模式在对 `.vue` 文件内涉及的样式资源进行编译时，仅对 selector 相同的样式字段进行层叠整合，不同的 selector 会完整保留。

> 代码示例：[FalconDemo](https://gw.alipayobjects.com/os/bmw-prod/0ce503e9-c299-4037-b910-61359fd63137.zip)

---

## 二、背景

来源：https://help.aliyun.com/zh/document_detail/2261151.html

蚂蚁动态卡片提供了几种背景元素控制属性。

### 背景样式

指定一个元素的背景样式有以下几种方式：

- `background-color`，定义元素的背景颜色。

| 属性 | 值类型 | 默认值 | 写法 |
|---|---|---|---|
| background-color | 色彩单位 | transparent | `background-color:red;` |

- `background-image`，定义元素的背景图像。

| 属性 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|
| background-image | string | 无 | `url("https:/xxx")` CDN 地址；`url("./xxx")` 离线包相对地址；`url("data:")` base64 编码；`linear-gradient(s1,s2,…,slast)` 渐变（第一段=渐变角度设置，取值为具体角度值以 deg 结尾，或方向描述，包括 top、to top、right、to right、bottom、to bottom、left、to left；第二段=渐变起始颜色设置，色彩单位，如果有百分比值必须为 0%；中间段=渐变过程颜色设置，色彩单位，支持设置百分比值，必须为线性递增方式，不提供百分比时颜色占比均分；最后一段=渐变终止颜色设置，色彩单位，如果有百分比值必须为 100%）；`none`：清除背景 | `background-image: linear-gradient(45deg, red 0%, #333 50%, rgb(255,0, 255) 80%, green 100%);` | 无 |
|  |  |  |  | `background-image: linear-gradient(to top,red, #333, rgb(255, 0, 255), green);` |  |
|  |  |  |  | `background-image: url("https://gw-office.alipayobjects.com/basement_prod/...png");` |  |
| background-size | string 或长度单位 | auto | 单描述值（cover，contain，auto）；`${x}px ${y}px` 双精确值长度单位+百分比；`${x}px` 单值长度单位+百分比 | `background-size:contain;` | 精确值或百分比只单值时，另外一个值默认 auto |
|  |  |  |  | `background-size:100px 200px;` |  |
| background-position | string | 0 | 单描述值（top，right，bottom，left，center）；双描述值（bottom right）；`${x}px` 单值长度单位/`${y}px` 单值长度单位+单描述值；`${x}px` 单值长度单位+百分比；`${y}px` 单值长度单位+百分比 | `background-position:top;` | 单值时，另一个值默认居中 |
|  |  |  |  | `background-position:bottom right;` |  |
|  |  |  |  | `background-position:30px left;` |  |
|  |  |  |  | `background-position:100px;` |  |
|  |  |  |  | `background-position:50px 50px;` |  |
| background-repeat | string | repeat | repeat-x, repeat-y, no-repeat, repeat | 单值：`background-repeat: repeat-x;` | 无 |
|  |  |  |  | 双值：`background-repeat: repeat no-repeat;`其中 x 轴描述包含（no-repeat、repeat）y 轴描述包含（no-repeat、repeat） | 无 |

- **background 简写方式**：
  - background-color 和 background-image 相关样式可合并简写，无关先后顺序；
  - background-image 相关样式可合并简写，例如 background-image 和 background-repeat；
  - 支持使用 `none` 清除背景；

**示例：**

```
background:url('https://img.alicdn.com/...png') repeat-x;
background:url('https://img.alicdn.com/...png') #f0f no-repeat;
background:url('https://img.alicdn.com/...png') #00f repeat-x bottom;
background:#ff0 url('https://img.alicdn.com/...png') repeat-y right;
```

**背景的基本用法示例：**

```
div
{
	background-image:url('img_tree.png');
	background-repeat:repeat;
}
```

**重要**

- 同时设置背景图和渐变色时的优先级关系：渐变色（background-repeat）> 背景图（background-image）；
- **【v-alipay-10.2.0】** 渐变背景支持多种写法，如：`background: linear-gradient(#FF6010, 50%, #FFD2B3, #FFF2E9, #FFFFFF);`。

### 阴影

用于设置元素的阴影。

| 属性 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|
| box-shadow | 长度单位&色彩单位 | 无 | 支持格式 `${x}${y}${size}${color}`，x、y、size 满足长度单位，color 满足色彩单位 | `box-shadow: 10px 20px 10px red;` | 四个值必需 |

**重要**

- 目前蚂蚁动态卡片内置组件在 iOS/Android 平台均支持该样式；
- 每个元素只支持设置一个阴影效果，不支持多个阴影同时作用于一个元素。

**阴影的基本使用示例：**

```
div
{
	width:300px;
	height:100px;
	background-color:yellow;
	box-shadow: 10px 10px 5px #888888;
}
```

### 透明度

| 属性 | 值类型 | 默认值 | 可选值 | 写法 |
|---|---|---|---|---|
| opacity | float | 1 | 0-1 的浮点数 | `opacity:0.5;` |

---

## 三、filter

来源：https://help.aliyun.com/zh/document_detail/342865.html

CSS 属性将模糊或颜色偏移等图形效果应用于元素。滤镜（filter）通常用于调整图像、背景和边框的渲染。

### 支持的函数

| 函数 | 含义 | 默认值 | 取值范围 |
|---|---|---|---|
| grayscale() | 图像灰度。值为 100% 表示完全转为灰度图像。 | 0 | 0%~100% |
| opacity() | 图像的透明程度。 | 1 | 0%~100% |
| invert() | 反转图像。值为 100% 表示完全反转。 | 0 | 0%~100% |
| sepia() | 将图像转换为深褐色。值为 100% 表示完全为深褐色。 | 0 | 0%~100% |
| saturate() | 图像饱和度。值为 0% 表示完全不饱和；值为 100% 表示图像无变化；其他值是效果的线性乘数；超过 100% 表示有更高的饱和度。 | 1 | 0%~+∞ |
| contrast() | 图像的对比度。值为 0% 表示图像会全黑；值为 100% 表示图像不变。值可以超过 100%，意味着会运用更低的对比。 | 1 | 0%~+∞ |
| brightness() | 将线性乘法器应用于图像，使其看起来或多或少地变得明亮。值为 0% 表示将创建全黑图像；值为 100% 表示会使输入保持不变；其他值是效果的线性乘数；如果值大于 100% 则表示提供更明亮的结果。 | 1 | 0%~+∞ |

### 不支持的函数

不支持复合函数，不支持 blur、drop-shadow、hue-rotate、url。

### 示例

```
<template>
 <div class="root">
    <text>normal</text>
    <image
      class="image-normal"
      src="https://pic49.photophoto.cn/20181202/0021033888940147_b.jpg"
 ></image>

    <text>grayscale:100%</text>
    <image
      class="image-gray"
      style="bg"
      src="https://pic49.photophoto.cn/20181202/0021033888940147_b.jpg"
 ></image>
  </div>
</template>
<script>
export default {
 data: {},
 methods: {},
};
</script> <style>
.root {
 display: flex;
 align-items: center;
 justify-content: center;
}
.image-normal {
 flex-direction: column;
 flex-shrink: 0;
 align-content: auto;
 width: 350rpx;
 height: 350rpx;
}
.image-gray {
 flex-direction: column;
 flex-shrink: 0;
 align-content: auto;
 width: 350rpx;
 height: 350rpx;
 filter: grayscale(100%);
}
</style>
```

> 完整示例：[detailImageFilter.zip](https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20220415/knbk/detailImageFilter.zip)

---

## 四、盒子模型

来源：https://help.aliyun.com/zh/document_detail/342843.html

蚂蚁动态卡片中的盒模型基于 CSS 盒模型，将所有元素表示为一个个矩形的盒子（box），其他样式决定这些盒子的大小、位置以及属性（例如颜色、背景、边框……）。

盒模型描述了一个元素所占的控件，每个盒子有四个边界：**外边距边界（margin edge）、边框边界（border edge）、内边距边界（padding edge）、内容边界（content edge）**。

### 外边距

外边距指元素和元素之间的空白距离，由 margin 属性控制，简写与非简写方式都支持。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|---|
| margin | 外边框距离 | 长度单位 | 0 | auto；单值长度单位或百分比 | `margin: 10px 10px 10px 10px;` | 四个属性值依次对应上、右、下、左边框的距离 |
|  |  |  |  |  | `margin: 10px 10px 10px;` | 三个属性值依次对应上、左右、下边框的距离 |
|  |  |  |  |  | `margin: 10px 10px;` | 依次对应上下、左右边框的距离 |
|  |  |  |  |  | `margin: 10px;` | 四边外边框距离相同 |
| margin-left | 外边框距离 | 长度单位 | 0 | auto；单值长度单位或百分比 | `margin-left: 10px;` | - |
| margin-right | 外边框距离 | 长度单位 | 0 | auto；单值长度单位或百分比 | `margin-right: 10px;` | - |
| margin-top | 外边框距离 | 长度单位 | 0 | auto；单值长度单位或百分比 | `margin-top: 10px;` | - |
| margin-bottom | 外边框距离 | 长度单位 | 0 | auto；单值长度单位或百分比 | `margin-bottom: 10px;` | - |

### 内边距

内边距指内容和边框的距离，由 padding 属性控制，简写与非简写方式都支持。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|---|
| padding | 内边距 | 长度单位 | 0 | auto；单值长度单位或百分比 | `padding: 10px 10px 10px 10px;` | 四个属性值依次对应上、右、下、左边的内边距 |
|  |  |  |  |  | `padding: 10px 10px 10px;` | 三个属性值依次对应上、左右、下边的内边距 |
|  |  |  |  |  | `padding: 10px 10px;` | 两个属性值依次对应上下、左右的内边距 |
|  |  |  |  |  | `padding: 10px;` | 四边的内边距相同 |
| padding-left | 内边距 | 长度单位 | 0 | auto；单值长度单位或百分比 | `padding-left: 10px;` | - |
| padding-right | 内边距 | 长度单位 | 0 | auto；单值长度单位或百分比 | `padding-right: 10px;` | - |
| padding-top | 内边距 | 长度单位 | 0 | auto；单值长度单位或百分比 | `padding-top: 10px;` | - |
| padding-bottom | 内边距 | 长度单位 | 0 | auto；单值长度单位或百分比 | `padding-bottom: 10px;` | - |

### 内容边距

内容边距指宽或高减去边框边界和内边距后的距离，即：**内容边距 = 宽/高 - 边框边界 - 内边距**。

### 宽高

卡片的 `box-sizing` 属性仅支持 **border-box**，意味着宽高设定的是边框区域的宽和高。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 |
|---|---|---|---|---|---|
| width | 元素宽度 | 长度单位 | 0 | auto；单值长度单位或百分比 | `width: 100px;` |
| min-width | 最小宽度限定 | 长度单位 | - | - | `min-width: 50px;` |
| max-width | 最大宽度限定 | 长度单位 | - | - | `max-width: 200px;` |
| height | 元素高度 | 长度单位 | 0 | auto；单值长度单位或百分比 | `height: 100px;` |
| min-height | 最小高度限定 | 长度单位 | - | - | `min-height: 50px;` |
| max-height | 最大高度限定 | 长度单位 | - | - | `max-height: 200px;` |

### 边框

指定边框的样式，包括宽度、颜色、样式、圆角。支持 border、border-left、border-top、border-bottom、border-right 的简写方式，也支持 border-style、border-width、border-color、border-radius 的简写方式。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|---|
| border | 边框 | string | none | - | `border: 1px solid #f32600;` | 宽度、线样式、颜色，三个元素位置不限 |
| border-left | 左边框 | string | none | - | `border-left: 1px solid #f32600;` |  |
| border-right | 右边框 | string | none | - | `border-right: 1px solid #f32600;` |  |
| border-top | 上边框 | string | none | - | `border-top: 1px solid #f32600;` |  |
| border-bottom | 下边框 | string | none | - | `border-bottom: 1px solid #f32600;` |  |
| border-style | 边框样式 | string | none | dotted、solid、dashed、none | `border-style: solid dotted dashed solid` | 四个属性值依次对应上、右、下、左边框的样式 |
|  |  |  |  |  | `border-style: solid dotted solid` | 三个属性值依次对应上、左右、下边框的样式 |
|  |  |  |  |  | `border-style: solid dashed` | 两个属性值依次对应上下、左右边框的样式 |
|  |  |  |  |  | `border-style: solid` | 四边边框样式相同 |
| border-left-style | 边框样式 | string | none |  | `border-left-style: solid` | - |
| border-top-style | 边框样式 | string | none |  | `border-top-style: solid` | - |
| border-right-style | 边框样式 | string | none |  | `border-right-style: solid` | - |
| border-bottom-style | 边框样式 | string | none |  | `border-bottom-style: solid` | - |
| border-width | 边框宽度 | 长度单位 | 3px | - | `border-width: 1px 1px 1px 1px` | 依次对应上、右、下、左边框的宽度 |
|  |  |  |  |  | `border-width: 1px 1px 1px` | 依次对应上、左右、下边框的宽度 |
|  |  |  |  |  | `border-width: 1px 1px` | 依次对应上下、左右边框的宽度 |
|  |  |  |  |  | `border-width: 1px` | 四边的边框宽度 |
| border-left-width | 边框宽度 | 长度单位 | 3px | - | `border-left-width: 1px` | - |
| border-right-width | 边框宽度 | 长度单位 | 3px | - | `border-right-width: 1px` | - |
| border-top-width | 边框宽度 | 长度单位 | 3px | - | `border-top-width: 1px` | - |
| border-bottom-width | 边框宽度 | 长度单位 | 3px | - | `border-bottom-width: 1px` | - |
| border-color | 边框颜色 | 色彩单位 | 0x000000 | - | `border-color: red #333 rgb(255, 255, 0) green` | 依次对应上、右、下、左边框的颜色 |
|  |  |  |  |  | `border-color: red #333 rgb(255, 255, 0)` | 依次对应上、左右、下边框的颜色 |
|  |  |  |  |  | `border-color: red #333` | 依次对应上下、左右边框的颜色 |
|  |  |  |  |  | `border-color: red` | 四个边框的颜色 |
| border-left-color | 边框颜色 | 色彩单位 | 0x000000 | - | `border-left-color: red;` | - |
| border-right-color | 边框颜色 | 色彩单位 | 0x000000 | - | `border-right-color: red;` | - |
| border-top-color | 边框颜色 | 色彩单位 | 0x000000 | - | `border-top-color: red;` | - |
| border-bottom-color | 边框颜色 | 色彩单位 | 0x000000 | - | `border-bottom-color: red;` | - |
| border-radius | 边框圆角半径 | 长度单位 | 0 | - | `border-radius: 10px 10px 10px 10px;` | 详见下方 border-radius 取值说明 |
|  |  |  |  |  | `border-radius: 10px 10px 10px;` |  |
|  |  |  |  |  | `border-radius: 10px 10px;` |  |
|  |  |  |  |  | `border-radius: 10px;` |  |
| border-top-left-radius | 边框圆角半径 | 长度单位 | 0 | - | `border-top-left-radius: 10px;` | - |
| border-top-right-radius | 边框圆角半径 | 长度单位 | 0 | - | `border-top-right-radius: 10px;` | - |
| border-bottom-left-radius | 边框圆角半径 | 长度单位 | 0 | - | `border-bottom-left-radius: 10px;` | - |
| border-bottom-right-radius | 边框圆角半径 | 长度单位 | 0 | - | `border-bottom-right-radius: 10px;` | - |

**border-radius 的取值说明：**

- 单值：表示边框四角的圆角半径。
- 双值：表示边框两个角的圆角半径。第 1 个值表示 topLeft/bottomRight；第 2 个值表示 topRight/bottomLeft。
- 三值：表示边框三个角的圆角半径。第 1 个值表示 topLeft；第 2 个值表示 topRight/bottomLeft；第 3 个值表示 bottomRight。
- 四值：表示边框四个角的圆角半径。第 1 个值表示 topLeft；第 2 个值表示 topRight；第 3 个值表示 bottomRight；第 4 个值表示 bottomLeft。

**边框的基本用法：**

```
div {
 border-style:solid;
 border-color:#ff0000;
 border-width:10px;
 border-radius:5px;
}
```

**说明**

- 当使用属性的简写方式时，简写中没写的样式，将按照默认值处理，例如 `border: 5px red;` 无效果，因为 border-style 默认为 none，而 `border: 5px solid;` 会显示 5px 的黑色实线边框，因为 border-color 默认黑色。

- 当属性的简写与非简写同时存在，遵循后者覆盖前者的原则，示例如下：

```
// 显示 5px 黑色实线边框 (black 覆盖 red)
border:5px red solid;
border-color:black;

// 显示无边框（none 覆盖 dotted）
border-style:dotted;
border:5px red
```

**盒模型的基本用法：**

```
div {
 background-color: lightgrey;
 width: 300px;
 border: 25px solid green;
 padding: 25px;
 margin: 25px;
}
```

> 完整示例：[detailBoxModel.zip](https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20220415/tzpr/detailBoxModel.zip)

---

## 五、布局

来源：https://help.aliyun.com/zh/document_detail/342933.html

本文对蚂蚁动态卡片中的布局样式进行说明。

### Flexbox

卡片的布局模型基于 CSS Flexbox，是一种一维的布局模型，使所有页面元素的排版能够一致可预测，同时布局能适应各种设备或者屏幕尺寸。

### Flex 容器

卡片中，Flexbox 是 **唯一的布局模型**，需设置 `display:flex`。如果一个卡片元素可以嵌套容纳其他元素，那么它就成为 Flex 容器。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|---|
| display | flex 布局 | string | flex | flex | `display:flex` | 需要显示指定节点为 flex 布局。 |

与 Web 的差异在于 **text 节点计算**：即在卡片中，text 节点的 size 不会大于其父节点的 size。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|---|
| flex-wrap | 决定了 flex 成员项在一行还是多行分布。 | string | nowrap | wrap、nowrap | `flex-wrap:wrap;` |  |
| flex-direction | 定义 flex 成员项的排列方向。 | string | column | column、row、row-reverse、column-reverse | `flex-direction:row;` |  |
| align-items | 定义 flex 成员项在纵轴方向上如何排列以处理空白部分。 | string | stretch | stretch、center、flex-start、flex-end、baseline | `align-items:center;` |  |
| align-content | 定义 flex 成员项如何沿着纵轴在内容项之间和周围分配空间。 | string | flex-start（web: stretch） | auto、stretch、center、flex-start、flex-end | `align-content:center;` | flex-wrap 为 nowrap 时无效。 |
| justify-content | 定义 flex 成员项在主轴方向上如何排列以处理空白部分。 | string | flex-start | flex-start、flex-end、center、space-between、space-around | `justify-content:center;` |  |

### Flex 成员

与 Web 的差异在于：

- **text 节点计算**：在没有设置 width、height 的情况下，卡片中 text 节点在 yoga 的计算中作为外部计算 size 的节点，并且计算的结果会遵循 flex 约束再次调整；而 Web 中 text 节点会根据内容计算 size，并且不受 flex 条件的约束。

- **flex-basis 差异**：在没有设置 width、height 的情况下，卡片中设置 flex-basis 后，会根据 flex-basis 的值为初始值来参与 flex 样式的计算，不会再考虑内容实际 size；而 Web 中则不会考虑 flex 约束，而使用内容实际 size 进行布局。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 | 备注 |
|---|---|---|---|---|---|---|
| flex | 定义了 flex 成员项可以占用容器中剩余空间的大小。 | 长度单位或百分比 | 0 |  | `flex:1;`、`flex:1 1 30px;` | 支持 flex: \<flex-grow\> \| \<flex-shrink\> \| \<'flex-basis\> 的简写。 |
| flex-grow | 定义了 flex 成员项在有可用剩余空间时拉伸比例。 | 长度单位 | 0 |  | `flex-grow: 1;` |  |
| flex-shrink | 定义了 flex 成员项的收缩的能力。 | 长度单位 | 0（web：1） |  | `flex-shrink: 1;` |  |
| flex-basis | 定义了在分配剩余空间之前 flex 成员项默认的大小。 | 长度单位或百分比 | auto | auto、像素值、百分比 | `flex-basis: auto;`、`flex-basis: 50px;`、`flex-basis: 30%;` |  |
| align-self | 允许某个单独的 flex 成员项覆盖默认的对齐方式。 | string | auto | auto、center、stretch、flex-start、flex-end | `align-self:flex-start;` |  |

### 定位

支持定位（position）。position 属性规定元素的定位类型后，可通过 top、bottom、left、right 四个属性设置坐标。

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 |
|---|---|---|---|---|---|
| position | 定位类型 | string | relative | relative、absolute、fixed | `position: fixed;` |
| top | 距离上方的偏移量 | 长度单位或百分比 | 0 |  | `top: 10px;` |
| bottom | 距离下方的偏移量 | 长度单位或百分比 | 0 |  | `bottom: 10px;` |
| left | 距离左方的偏移量 | 长度单位或百分比 | 0 |  | `left: 10px;` |
| right | 距离右方的偏移量 | 长度单位或百分比 | 0 |  | `right: 10px;` |

### 其他

| 属性 | 描述 | 值类型 | 默认值 | 可选值 | 写法 |
|---|---|---|---|---|---|
| overflow | 控制内容溢出元素框时内容是否被裁剪 | string | visible | visible，hidden | `overflow:hidden;` |
| visibility | 指定一个元素是否是可见的 | string | visible | visible，hidden | `visibility:hidden;` |

### Flexbox 的基本用法

**重要**

- 当使用属性的简写方式时，简写中没写的样式，将按照默认值处理。
- 当属性的简写与非简写同时存在，遵循后者覆盖前者的原则。

```
.flex-container {
 display: flex;
 width: 400px;
 height: 250px;
 background-color: lightgrey;
 flex-direciton: row;
}

.flex-item {
 background-color: cornflowerblue;
 width: 100px;
 height: 100px;
 margin: 10px;
}

<div class="flex-container">
  <text class="flex-item">flex item 1</text>
  <text class="flex-item">flex item 2</text>
  <text class="flex-item">flex item 3</text>  
</div>
```

> 完整示例：[detailFlex.zip](https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20220415/vtnl/detailFlex.zip)

---

## 六、hover

来源：https://help.aliyun.com/zh/document_detail/342937.html

蚂蚁动态卡片支持配置 hover 属性，通过 hover 属性配置节点样式。当手势点击具有 hover 配置的节点时，该节点显示 hover 属性配置的样式，当手势离开该节点时恢复原始样式。

### 样式

目前支持以下两个 hover 样式：

| 属性 | 值类型 | 默认值 | 写法 | 备注 |
|---|---|---|---|---|
| background-color | 色彩单位 | 0 | `background-color:red;` | hover 发生时的背景色变化。 |
| color | 色彩单位 | - | `color:rgb(255,0,255);` | hover 发生时的字体颜色变化。 |

### 示例

```
<text
  class="normal-text"
  value="06.hover + touchcancel"
  :hover="hoverDic"
></text>

data: {
 hoverDic: {
 backgroundColor: "#7b8b6f",
 color: "white"
 }
 } 
```

### 注意事项

使用 hover 属性时，需注意以下几点：

- **不支持手势移动检测 hover 变化**，即 hover 仅支持点击状态变化。

- **不支持向上透传**，即叶子节点优先响应 hover 事件，并且同时最多一个节点响应 hover 事件。例如，A 和 B 两个节点都有 hover 属性，并且 B 是 A 的子节点，则当 B 触发 hover 事件时，A 不会再触发 hover 事件。

- **遵循 touch 事件拦截规则**，即子节点如果响应 hover 或 touch 事件，则父节点不再响应 hover 或 touch 事件。例如，A 和 B 两个节点，B 是 A 的子节点，如果 B 响应 hover 事件或 touch 事件，则 A 不再响应 hover 或 touch 事件。

- **平台差异**。受现有手势能力的平台差异影响，具有 hover 属性的节点在动画过程中（位移动画）的响应在不同平台表现不同。Android 平台支持位移动画轨迹过程中的 hover 响应；iOS 平台不支持位移动画轨迹过程中的 hover 响应。

> 完整示例：[detailHover.zip](https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20220415/skrt/detailHover.zip)

---

## 七、动画

来源：https://help.aliyun.com/zh/document_detail/342934.html

蚂蚁动态卡片支持动画属性，包括尺寸大小、旋转、平移和颜色等，可以逐渐从一个值变化到另一个值。

### Transition

| 属性 | 值类型 | 默认值 | 可选值 | 写法 |
|---|---|---|---|---|
| transition-property | string | 空 | background-color，opacity，transform，all | `transition-property: all;` |
|  |  |  |  | `transition-property: background-color, opacity;` |
|  |  |  |  | `transition-property: background-color, opacity, transform;` |
| transition-duration | number | 0 |  | `transition-duration: 200;` |
| transition-delay | number | 0 |  | `transition-delay: 200;` |
| transition-timing-function | string | ease | ease，ease-in，ease-out，ease-in-out，linear，cubic-bezier(x1,y1,x2,y2) | `transition-timing-function: ease-in;` |
|  |  |  |  | `transition-timing-function: cubic-bezier(0.3, 0.3, 0.9, 0.9);` |

**Transition 用法示例：**

```
.panel {
 margin: 10px;
 top:10px;
 align-items: center;
 justify-content: center;
 transition-property: background-color;
 transition-duration: 0.3s;
 transition-delay: 0s;
 transition-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1.0);
 }
```

### Transform

| 属性 | 值类型 | 默认值 | 可选值 | 备注 |
|---|---|---|---|---|
| transform | string |  | translateX({\<length/percentage\>})\|translateY({\<length/percentage\>})\|translateZ({\<length\>})\|translate({\<length/percentage\>} {\<length/percentage\>})\|translate3D({\<length\>},{\<length\>},{\<length\>})\|scaleX(\<number\>)\|scaleY(\<number\>)\|scale(\<number\>)\|rotate(\<angle/degree\>)\|rotateX(\<angle/degree\>)\|rotateY(\<angle/degree\>)\|rotateZ(\<angle/degree\>)\|rotate3D(\<angle/degree\>, \<number\>, \<number\>,\<number\>)\|transform-origin (center)\|matrix(n,n,n,n,n,n) | translateX({\<length/percentage\>})：X 轴方向平移，支持长度单位或百分比。translateY({\<length/percentage\>})：Y 轴方向平移，支持长度单位或百分比。translate({\<length/percentage\>} {\<length/percentage\>})：X 轴和 Y 轴方向同时平移，translateX + translateY 简写。scaleX(\<number\>)：X 轴方向缩放，值为数值，表示缩放比例，不支持百分比。scaleY(\<number\>)：Y 轴方向缩放，值为数值，表示缩放比例，不支持百分比。scale(\<number\>)：X 轴和 Y 轴方向同时缩放，scaleX + scaleY 简写。rotate(\<degree\>)：将元素围绕一个定点（由 transform-origin 属性指定）旋转而不变形的转换。指定的角度定义了旋转的量度。若角度为正，则顺时针方向旋转，否则逆时针方向旋转。transform-origin：设置一个元素变形的原点，只支持 center。matrix：2D 转换矩阵。translateZ/rotateZ 仅在 transform-style 值为 preserve-3d 时生效，translateZ 不支持 percent 写法。 |
| transform-origin | string | center | left、right、top、bottom、center、数值（支持单值和双值两种写法） |  |
| transform-style | string | flat | preserve-3d, flat |  |
| perspective | length | none | none \| \<length\> | 须为正值，负值或 0 与 none 效果一致。 |
| perspective-origin | string | center | left、right、top、bottom、center、数值（支持单值和双值两种写法） |  |

**Transform 用法示例：**

```
.transform {
 align-items: center;
 transform: translate(150px, 200px) rotate(20deg);
 transform-origin: 0 -250px;
 border-color:red;
 border-width:2px;
 }
```

**3D 动画示例：**

```
.div {
 width: 300px;
 height: 300px;
 transform-style: preserve-3d;
 transform: rotateX(45deg) rotateZ(30deg) translateZ(-50px);
 perspective: 600px;
}
```

**3D 动画约束：**

- 动画嵌套限制 2 层（即父节点和子节点同时有动画），若父节点、子节点、孙子节点同时有 3D 动画，则最终效果可能会受限。
- 针对 Android 客户端效果，受平台限制，View 不能分割，View 只能显示全部或被遮盖全部。Android 效果下，一个 face2 完全压盖 face1；而 CSS、iOS 可以达到更好的效果。

### Animation

| 属性 | 值类型 | 默认值 | 可选值 | 写法 |
|---|---|---|---|---|
| animation-name | string |  |  | `animation-name: demo;` |
| animation-duration | number | 0 |  | `animation-duration: 100;` |
| animation-delay | number | 0 |  | `animation-delay: 200;` |
| animation-timing-function | string | ease | ease，ease-in，ease-out，ease-in-out，linear，cubic-bezier(x1,y1,x2,y2) | `animation-timing-function: ease-in;` |
|  |  |  |  | `animation-timing-function: cubic-bezier(0.3, 0.3, 0.9, 0.9);` |
| animation-iteration-count | number |  | 数值；infinite（等价于 9999） | `animation-iteration-count: infinite;` |
|  |  |  |  | `animation-iteration-count: 10;` |
| animation-direction | enum | normal | normal，alternate | `animation-direction: alternate;` |
| animation-fill-mode | enum | forwards | forwards，backwards，both，none | `animation-fill-mode: backwards;` |

**Animation 用法示例：**

```
.moving-node01 {
 width: 200rpx;
 height: 100rpx;
 background-color: red;
 margin-top: 50rpx;
 animation-name: moving-horizontal;
 animation-duration: 5000ms;
 animation-delay: 2000ms;
 animation-timing-function: ease;
 animation-iteration-count: infinite;
 animation-direction: normal;
 animation-fill-mode: forwards;
}
```

### KeyFrame 动画

```
<template>
 <div class="root">
 <div class="line">
 <div class="subline"></div>
 </div>
 </div>
</template>

<script>
 const animation = requireModule("animation"); //获取module
 const keyframes = {
 'moving-horizontal': {
 "transform": [
 {
 "p":0,
 "v":"translateX(-200px)"
 },
 {
 "p":0.5,
 "v":"translateX(-100px)"
 },
 {
 "p": 1.0,
 "v": "translateX(0px)"
 }
 ]
 }
 };
 animation.loadKeyframes(keyframes); //加载module
</script>

<style>
 .root {
 display: flex;
 align-items: center;
 justify-content: center;
 }

 .line{
 width:200px;
 height:10px;
 overflow: hidden; 
 background-color:gray;
 }
 .subline{
 transform:translate(-200px,0px);
 width:200px;
 height:10px;
 background-color:red; 

 animation-name: moving-horizontal;
 animation-duration: 2000ms;
 animation-delay: 000ms;
 animation-timing-function: linear;
 }
</style>
```

### 动画结束回调

节点定义事件 `@on-animationEnd`，动画结束后会回调相应方法传入参数 `{"status":"finish/interrupt"}`。finish 表示动画正常执行结束，cancel 表示中断或取消。

代码示例：

```
<template>
 <div class="root">
 <div class="anim_node" @on-animationEnd="onAnimationEnd()"></div>
 </div>
</template>

 <script>
 ...
 methods: {
 onAnimationEnd(param){
 if(param.status == "finish") {
 console.info("动画执行完成");
 } else if (param.status == "interrupt") {
 console.info("动画中断或取消");
 }
 },
 },
};
</script>

<style>
 ...
</style>
```

### 注意事项

使用动画属性时，需注意以下几点：

- 根节点不支持动画。
- 实体组件和外接组件不支持动画（input、slider 等）。
- 不支持 skew 动画，效果实现可使用 matrix 代替。
- KeyFrame 动画过程中，提交 CSS 动画无效。
- iOS 平台在移动过程中不支持手势，结束后才能响应。

> 完整示例：[detailTransitionAnimation.zip](https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20220415/ujpj/detailTransitionAnimation.zip)

---