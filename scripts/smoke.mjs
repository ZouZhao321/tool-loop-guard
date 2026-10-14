#!/usr/bin/env node
/**
 * 冒烟测试：加载扩展入口，断言签名生成与 KMP 最小周期两个纯函数的行为，
 * 并校验 package.json 清单以及 pi.extensions 指向的入口文件存在。
 *
 * 运行：npm test
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;

/** 断言并计数 */
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
}

/** 深比较断言并计数 */
function checkEqual(name, actual, expected) {
  assert.deepEqual(
    actual,
    expected,
    `${name}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`,
  );
  checks += 1;
  console.log(`  ok  ${name}`);
}

console.log("package.json 清单");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

checkEqual("name 为 tool-loop-guard", pkg.name, "tool-loop-guard");
checkEqual("license 为 MIT", pkg.license, "MIT");
checkEqual("engines.node 为 >=22", pkg.engines?.node, ">=22");
check("keywords 含 pi-package 与 pi-extension", () => {
  assert.ok(pkg.keywords?.includes("pi-package"), "keywords 缺少 pi-package");
  assert.ok(pkg.keywords?.includes("pi-extension"), "keywords 缺少 pi-extension");
});
check("peerDependencies 声明 pi-coding-agent", () => {
  assert.equal(pkg.peerDependencies?.["@earendil-works/pi-coding-agent"], "*");
});
check("files 列出发布内容", () => {
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, "files 不能为空");
  assert.ok(pkg.files.includes("src"), "files 缺少扩展入口目录 src");
  assert.ok(pkg.files.includes("README.md"), "files 缺少 README.md");
  assert.ok(pkg.files.includes("CHANGELOG.md"), "files 缺少 CHANGELOG.md");
  assert.ok(pkg.files.includes("LICENSE"), "files 缺少 LICENSE");
});

console.log("扩展入口");

const entries = pkg.pi?.extensions ?? [];
checkEqual("pi.extensions 仍指向 ./src/index.ts", entries, ["./src/index.ts"]);
check("入口文件存在", () => {
  for (const entry of entries) {
    assert.ok(existsSync(resolve(root, entry)), `${entry} 不存在`);
  }
});

const mod = await import(pathToFileURL(resolve(root, "src/index.ts")).href);

checkEqual("默认导出是扩展函数", typeof mod.default, "function");
checkEqual("导出 makeSignature 纯函数", typeof mod.makeSignature, "function");
checkEqual("导出 minimumPeriod 纯函数", typeof mod.minimumPeriod, "function");

console.log("makeSignature");

const { makeSignature, minimumPeriod } = mod;

checkEqual("bash 去掉首尾空白", makeSignature("bash", { command: "  ls -la  " }), "bash:ls -la");
checkEqual("bash 缺省 command 为空串", makeSignature("bash", {}), "bash:");
checkEqual("read 使用 path", makeSignature("read", { path: "src/index.ts" }), "read:src/index.ts");
checkEqual("write 使用 path", makeSignature("write", { path: "a.txt" }), "write:a.txt");
checkEqual("edit 使用 path", makeSignature("edit", { path: "a.txt" }), "edit:a.txt");
checkEqual(
  "grep 使用 pattern + path",
  makeSignature("grep", { pattern: "foo", path: "src" }),
  "grep:foo:src",
);
checkEqual(
  "find 使用 pattern + path",
  makeSignature("find", { pattern: "*.ts", path: "src" }),
  "find:*.ts:src",
);
checkEqual("ls 缺省 path 为 .", makeSignature("ls", {}), "ls:.");
checkEqual("ls 使用 path", makeSignature("ls", { path: "src" }), "ls:src");
checkEqual("其他工具回退到 JSON", makeSignature("custom_tool", { a: 1 }), 'custom_tool:{"a":1}');

console.log("minimumPeriod");

checkEqual("单元素无周期", minimumPeriod(["a"]), { period: 1, hasCycle: false });
checkEqual("三元素无周期", minimumPeriod(["a", "b", "c"]), { period: 3, hasCycle: false });
checkEqual("全同元素周期为 1", minimumPeriod(["a", "a", "a"]), { period: 1, hasCycle: true });
checkEqual("abab 周期为 2", minimumPeriod(["a", "b", "a", "b"]), { period: 2, hasCycle: true });
checkEqual("abcabc 周期为 3", minimumPeriod(["a", "b", "c", "a", "b", "c"]), {
  period: 3,
  hasCycle: true,
});
checkEqual("aab 不是精确周期", minimumPeriod(["a", "a", "b"]), { period: 3, hasCycle: false });
checkEqual("ababx 不是精确周期", minimumPeriod(["a", "b", "a", "b", "x"]), {
  period: 5,
  hasCycle: false,
});
checkEqual("八元窗口 abababab 周期为 2", minimumPeriod(["a", "b", "a", "b", "a", "b", "a", "b"]), {
  period: 2,
  hasCycle: true,
});
checkEqual(
  "aaaabaaaab 周期为 5",
  minimumPeriod(["a", "a", "a", "a", "b", "a", "a", "a", "a", "b"]),
  { period: 5, hasCycle: true },
);

console.log(`\n${checks} 项断言全部通过`);
