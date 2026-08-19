# Node.js TypeScript Minimal Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a minimal npm-based Node.js TypeScript project that supports development execution, type checking, compilation, and execution of compiled output.

**Architecture:** A single ESM entry point lives in `src/index.ts`. TypeScript compiles it into `dist/index.js`; `tsx` runs the source directly during development, while Node.js runs the compiled JavaScript in production-style execution.

**Tech Stack:** Node.js, npm, TypeScript, tsx

**Spec:** `docs/superpowers/specs/2026-08-19-node-typescript-template-design.md`

## Global Constraints

- Use npm for dependency management and scripts.
- Use the Node.js ESM module system.
- Enable TypeScript strict mode.
- Keep the project minimal: do not add a web framework, test framework, linter, formatter, environment-variable library, or publishing configuration.
- Build output must be written to `dist/`.

---

## File Map

- `package.json`: Declares ESM mode, npm scripts, and development dependencies.
- `package-lock.json`: Locks the exact dependency graph installed by npm.
- `tsconfig.json`: Configures strict Node-compatible TypeScript compilation from `src/` to `dist/`.
- `src/index.ts`: Provides the executable sample entry point.
- `.gitignore`: Excludes dependencies, build output, environment files, logs, and OS metadata.
- `README.md`: Documents prerequisites, installation, and every supported command.

### Task 1: Create and verify the minimal project

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: Node.js and npm installed on the local machine.
- Produces: npm commands `dev`, `typecheck`, `build`, and `start`; executable entry point `src/index.ts`; compiled entry point `dist/index.js`.

- [ ] **Step 1: Record the pre-scaffold failure**

Run:

```bash
npm run typecheck
```

Expected: FAIL because `package.json` and the `typecheck` script do not exist yet.

- [ ] **Step 2: Create the package manifest**

Create `package.json`:

```json
{
  "name": "cc-explain",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc --build --clean && tsc",
    "start": "node dist/index.js"
  },
  "devDependencies": {
    "tsx": "^4.20.5",
    "typescript": "^5.9.2"
  }
}
```

- [ ] **Step 3: Configure strict TypeScript compilation**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Add the executable entry point**

Create `src/index.ts`:

```typescript
const message: string = "Node.js + TypeScript is running!";

console.log(message);
```

- [ ] **Step 5: Add repository exclusions**

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.*
*.log
.DS_Store
```

- [ ] **Step 6: Document project usage**

Create `README.md`:

````markdown
# Node.js TypeScript Template

A minimal Node.js project using TypeScript and npm.

## Setup

```bash
npm install
```

## Commands

- `npm run dev` runs the TypeScript source directly.
- `npm run typecheck` checks types without generating files.
- `npm run build` compiles the source into `dist/`.
- `npm start` runs the compiled JavaScript.
````

- [ ] **Step 7: Install dependencies and generate the lockfile**

Run:

```bash
npm install
```

Expected: PASS and create `package-lock.json` with `typescript` and `tsx` locked under `devDependencies`.

- [ ] **Step 8: Verify development execution and types**

Run:

```bash
npm run typecheck
npm run dev
```

Expected: type checking exits successfully, then development execution prints `Node.js + TypeScript is running!`.

- [ ] **Step 9: Verify the build and compiled execution**

Run:

```bash
npm run build
npm start
```

Expected: any prior TypeScript build output is cleaned, `dist/index.js` is created, and `npm start` prints `Node.js + TypeScript is running!`.

- [ ] **Step 10: Commit the working template**

```bash
git add .gitignore README.md package.json package-lock.json src/index.ts tsconfig.json
git commit -m "feat: create minimal Node TypeScript template"
```
