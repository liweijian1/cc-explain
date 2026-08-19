# Node.js TypeScript 最小模板设计

## 目标

在当前空仓库中创建一个基于 npm 的最小可运行 Node.js + TypeScript 项目。模板应支持直接开发运行、静态类型检查、构建，以及运行构建产物。

## 技术方案

- 使用 Node.js 的 ESM 模块系统。
- 使用 TypeScript 严格模式进行类型检查，并用 `tsc` 编译到 `dist/`。
- 使用 `tsx` 在开发环境中直接运行 TypeScript 入口文件。
- 使用 npm 管理依赖与脚本。

## 文件结构

```text
.
├── src/
│   └── index.ts
├── .gitignore
├── package.json
├── README.md
└── tsconfig.json
```

`src/index.ts` 是唯一的程序入口，运行时输出一条成功消息。`.gitignore` 忽略依赖目录、构建产物和常见本地环境文件。

## 命令

- `npm run dev`：通过 `tsx` 直接运行 `src/index.ts`。
- `npm run typecheck`：执行 TypeScript 类型检查但不生成文件。
- `npm run build`：清理并重新生成 `dist/`。
- `npm start`：通过 Node.js 运行 `dist/index.js`。

## 错误处理

该模板不包含业务逻辑，因此不引入额外的错误处理框架。构建、类型检查或运行失败时，由对应命令返回非零退出码并输出错误信息。

## 验收标准

1. `npm install` 能安装项目依赖。
2. `npm run typecheck` 无错误完成。
3. `npm run build` 生成 `dist/index.js`。
4. `npm start` 成功运行，并输出预期消息。
5. `npm run dev` 能直接运行 TypeScript 入口文件。

## 非目标

模板不包含 Web 框架、测试框架、代码检查器、格式化器、环境变量库或发布配置。后续可按实际用途单独添加。
