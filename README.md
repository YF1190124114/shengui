# Mythic Service Company

## 神界有限公司：一个关于中国民间神明的组织网络可视化

如果一家企业已经持续运营了一千多年，
没有办公室，
没有工资，
却一直在响应人们的需求，
它会是什么样子？

这个项目尝试把中国民间神明重新理解为一家跨越千年的公共服务公司（Mythic Service Company）。

在传统叙事中，神明通常按照神话故事、宗教体系或民俗文化被介绍。而在这个项目中，我们尝试换一种观察方式：

**神不是身份，而是一种岗位（Position）。**

每当社会产生一种需求，就会出现对应的神职。有人负责天气，有人负责疾病，有人负责财富，有人负责儿童，有人负责交通，有人负责村庄。

随着时代变化，新的岗位不断出现，旧的岗位逐渐消失。因此神明并不是固定名单，而是一套不断变化的公共服务网络。

---

## Project Overview

整个项目把 140 位云南甲马中的神明重新组织成一家公司的组织架构。包括：

- **7 个业务部门**（Departments）
- **140 位员工**（Employees）
- **数百条协作关系**（Relations）
- **员工档案**（Personnel Files）
- **部门索引**（Department Index）
- **企业内网**（Internal Network）

用户并不是阅读一篇关于神明的文章，而是作为一名刚刚入职的新员工，进入 Mythic Service Company 的内部管理系统，探索每一位神明员工如何协同完成整个社会的公共服务。

---

## Design Concept

整个可视化没有采用传统的思维导图或宗教谱系，而是借用了现代企业信息系统（Enterprise Information System）的视觉语言：

- 企业内网（Intranet）
- 员工档案（Personnel Dossier）
- 部门组织架构（Department Structure）
- 网络关系图（Network Graph）
- 新员工入职引导（Employee Onboarding）

这种转换让用户能够用一种熟悉的现代组织逻辑重新理解传统民间信仰。

---

## Data Source

本项目数据来源于云南甲马神谱整理。每位神明都被重新整理为：

- 姓名
- 部门
- 职位
- 服务领域
- 关系网络
- 甲马数量
- 图片档案

所有关系均重新编码并构建为网络数据。

---

## Features

- **网络可视化** - Canvas 绘制，支持拖拽节点、缩放、平移
- **部门筛选** - 按部门分类筛选节点
- **关系筛选** - 显示/隐藏不同类型的关系
- **甲马数量** - 最小甲马数量过滤
- **搜索** - 按名称、职位、服务搜索
- **档案卡** - 点击节点查看详细信息
- **引导教程** - 首次访问显示操作说明

---

## Tech Stack

- 原生 JavaScript
- Canvas 2D API
- CSS Grid/Flexbox
- Google Fonts (IBM Plex Mono, Space Grotesk)

## File Structure

```
/
├── index.html          # 主页面
├── styles.css          # 样式表
├── app.js              # 主逻辑
├── onboarding.js       # 引导教程
├── network-data.js     # 数据文件
├── 缩放后/             # 节点图片（名字_甲马数量.png）
└── modalpage/          # 引导页图片
```

## Data Format

### network-data.js

```javascript
const nodes = [
  { id: "1", name: "xxx", department: "自然神", position: "xxx", service: "xxx", jmaCount: 3 }
];

const edges = [
  { source: "1", target: "2", type: "同源" }
];
```

### Image Naming

图片文件名格式：`名字_甲马数量.png`（如 `井神_2.png`）

特殊节点：
- 编号 39 的财神 → `财神_16.png`
- 编号 51 的财神 → `财神_17.png`

## Interaction

| 操作 | 功能 |
|------|------|
| 滚轮 | 缩放 |
| 拖拽画布 | 平移视图 |
| 拖拽节点 | 移动节点位置 |
| 点击节点 | 打开档案卡 |
| 点击画布 | 关闭档案卡 |

## Deploy

本项目为纯静态页面，直接部署到任意静态托管服务（如 GitHub Pages）即可。

## License

MIT
