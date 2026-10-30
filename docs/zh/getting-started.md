# 快速开始

```sh
npm install @dskripchenko/drawio
```

```ts
import { render } from '@dskripchenko/drawio'

const { svg, width, height, page, pages, warnings } = render(fileText)
container.innerHTML = svg
```

`render` 接收 `.drawio` 文件的文本（页面可为压缩或普通格式）、单独的 `<mxGraphModel>`，或连同图一起导出的 SVG（`.drawio.svg`），并绘制其中一页。

| 字段       | 含义                                             |
| ---------- | ------------------------------------------------ |
| `svg`      | 绘图，一个完整的 `<svg>` 元素文本                |
| `width`    | 宽度（像素）                                     |
| `height`   | 高度（像素）                                     |
| `page`     | 所绘制的页面：`{ index, id, name }`              |
| `pages`    | 所有页面的名称，用于页面切换                     |
| `warnings` | 被替换为占位符的内容：厂商图形、文件外的图片     |

## 选项

```ts
render(fileText, {
  page: 'Architecture', // 序号、id 或名称；默认第一页
  title: '订单流程', // 无障碍标题；默认使用页面名称
  idPrefix: 'flow', // SVG 内的 id；同一文件在页面上显示两次时须唯一
  padding: 10,
  measureText, // 文本测量方式；浏览器中默认使用 canvas
  allowExternalImages: false, // 加载 http(s) 地址的图片
  limits: { maxLength: 5_000_000 }, // XML 限制
  maxPageSize: 10_000_000, // 压缩页面解压后允许的最大字节数
})
```

## 绘制内容

通用库和流程图库的图形——矩形、椭圆、菱形、三角形、六边形、平行四边形、梯形、圆柱、文档、云、过程、便签、卡片、标注、人物、步骤、延迟、显示、数据存储、块箭头、十字、泳道（水平与垂直）、表格、文本、线条——支持填充、渐变、描边、虚线、透明度、旋转和翻转。连接线支持直线、正交、肘形和实体关系布线，折点，圆角与曲线，固定连接点，以及 draw.io 的各种箭头和标签。容器、分组和图层；隐藏的图层和折叠容器的内容保持隐藏。支持 `UserObject` 的提示与链接，以及标签中的 `%占位符%`。

厂商库的图形（`mxgraph.aws4.*`、`mxgraph.azure.*` 等）不会被绘制——其图像归各自所有者——而是显示为带图形名称的虚线框。

## 主题

文件中设置的颜色按原样绘制。文件使用默认值的地方由 CSS 自定义属性决定，因此页面可以用深色主题显示这些图：

| 变量                         | 默认值      | 用途                     |
| ---------------------------- | ----------- | ------------------------ |
| `--drawio-font-family`       | Helvetica…  | 未指定字体的文本         |
| `--drawio-background`        | transparent | 绘图背景                 |
| `--drawio-fill`              | `#ffffff`   | 默认填充                 |
| `--drawio-stroke`            | `#000000`   | 默认线条                 |
| `--drawio-text`              | `#000000`   | 默认文本                 |
| `--drawio-label-background`  | `#ffffff`   | 连接线标签背景           |
| `--drawio-placeholder`       | `#9ca3af`   | 占位符                   |

文件已填充的图形上的文本保留文件中的文本颜色，以便在任何主题下都能在该填充上清晰可读。

## 读取模型

```ts
import { parseDrawio } from '@dskripchenko/drawio'

const file = parseDrawio(fileText)
file.pages[0].cells.get('api') // { id, parent, value, style, vertex, edge, geometry, data, … }
```

错误为 `DrawioError`，已知时会附带行号和列号。
