# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Gzweb 是 Gazebo Classic 仿真环境的 WebGL 客户端。通过浏览器实现 3D 仿真场景的可视化与交互。

技术栈：前端使用 Three.js + AngularJS + jQuery Mobile，后端为 Node.js WebSocket 服务器 + C++ 原生模块（通过 node-gyp 与 Gazebo 通信）。

## 常用命令

```bash
# 完整部署（npm install + grunt build + cmake + node-gyp + 模型处理）
./deploy.sh              # 基础部署
./deploy.sh -m           # 包含下载模型库
./deploy.sh -m local     # 仅使用本地模型
./deploy.sh -c           # 生成简化网格
./deploy.sh -t           # 生成模型缩略图

# 启动服务器（默认 8080 端口）
npm start
npm start --port=8081    # 指定端口

# 测试（ESLint + Karma/Jasmine，使用 Firefox + ChromeHeadless）
npm test                 # 带浏览器窗口
npm run test:headless    # 无头模式（CI 用）

# JS 构建（Grunt：拼接 + 最小化）
./node_modules/.bin/grunt build    # 完整构建（concat + uglify）
./node_modules/.bin/grunt concat   # 仅拼接（开发用）
./node_modules/.bin/grunt watch    # 监听文件变化自动重编译

# 增量更新（JS 构建 + CMake 刷新）
npm run update           # grunt build + cmake
npm run update-dev       # grunt concat + cmake（跳过最小化）

# 生成 JSDoc 文档
npm run docs
```

## 架构

### 三层架构

```
浏览器 (WebGL)  ←WebSocket→  Node.js 服务器  ←Gazebo IPC→  gzserver
     gz3d/                    gzbridge/                    Gazebo
```

### gz3d/ — 前端 3D 引擎

核心源码在 `gz3d/src/`，通过 Grunt 拼接为单文件部署到 `http/client/gz3d.gui.js`。

关键模块（均挂载在全局 `GZ3D` 命名空间下）：
- **gzscene.js** (~3000 行)：Three.js 场景管理，模型加载（COLLADA/OBJ/STL），灯光、相机、渲染循环
- **gziface.js** (~1400 行)：WebSocket 客户端，消息序列化/反序列化，与 Gazebo 的双向通信协议
- **gzgui.js** (~2400 行)：AngularJS 控制器，菜单系统，UI 交互逻辑
- **gzsdfparser.js**：解析 Gazebo SDF XML 格式为 Three.js 对象
- **gzmanipulator.js**：对象选取、移动、旋转操纵器
- **gzspawnmodel.js**：在场景中生成新模型
- **gzogre2json.js**：Ogre 材质格式转 JSON

第三方库以源文件形式存放在 `gz3d/client/js/include/`（Three.js、AngularJS、jQuery、RosLib 等），不通过 npm 管理。

### gzbridge/ — 通信桥

- **server.js**：Node.js HTTP 静态服务器 + WebSocket 服务器，10ms 轮询循环转发消息
- **C++ 原生模块**（通过 node-gyp 编译为 `gzbridge.node`）：
  - `GazeboInterface.cc`：连接 Gazebo 传输层
  - `pb2json.cc`：Protobuf 消息 ↔ JSON 转换
  - `OgreMaterialParser.cc`：Ogre 材质解析
  - `ConfigLoader.cc`：配置加载

### http/client/ — 部署目录

`index.html` 是主入口（AngularJS 应用，`ng-app='gzangular'`）。`assets/` 存放 Gazebo 模型资源。此目录内容由构建过程从 `gz3d/` 复制生成，不要直接编辑 `http/client/gz3d.gui.js`。

### tools/ — 模型处理工具

- `gzcoarse.cc`：网格简化工具（依赖 GTS 库）
- `gzthumbnails.sh`：调用 Gazebo 生成模型缩略图

## 构建系统

项目使用**双构建系统**：
1. **Grunt**：拼接 `gz3d/src/*.js` + 第三方库 → `gz3d/build/` 下的捆绑文件，再 uglify 最小化
2. **CMake**：编译 C++ 组件（gzbridge 静态库、gzcoarse 工具），复制前端文件到 `http/client/`

Grunt 的 `build_gui` 任务生成包含所有依赖的完整文件 `gz3d.gui.js`；`build_gz3d` 任务生成不含 GUI 的库文件（用于嵌入式场景）。

## 代码风格

- ESLint 强制 `max-len` 行长限制
- JSHint 要求：单引号 (`'`)、严格等号 (`===`)、花括号、无尾部空格
- 全局变量通过 `.jshintrc` 声明：`THREE`、`ROSLIB`、`EventEmitter2`、`_`、`xml2json` 等
- 使用 ES6 语法（`parserOptions.ecmaVersion: 6`）

## 测试

测试文件位于 `gz3d/test/`，使用 Karma + Jasmine 框架。测试夹具模型在 `gz3d/test/utils/`。测试运行在 `gz3d/build/gz3d.src.js`（仅源码拼接版本）上，需要先运行 `grunt concat`。

C++ 测试在 `gzbridge/test/`（Google Test），通过 CMake 构建运行。

## 系统依赖

构建需要：Gazebo 9+、libjansson-dev、libboost-dev、libtinyxml-dev、imagemagick、cmake、build-essential。可选：libgts-dev（网格简化）。
