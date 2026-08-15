/**
 * 「空间」插件宿主安全边界测试：工作区内路径解析（inside）。
 * 覆盖：根/子目录解析、.. 逃逸、绝对路径、符号链接逃逸、悬空符号链接删除放行。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inside } from "../lib/index.js";

let root;
let outside;

test.before(async () => {
  const base = await mkdtemp(join(tmpdir(), "wf-test-"));
  root = join(base, "ws");
  outside = join(base, "outside");
  await mkdir(root, { recursive: true });
  await mkdir(join(root, "sub"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "secret.txt"), "secret");
});

test.after(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("根目录本身可解析", async () => {
  const r = await inside(root, ".");
  assert.equal(r.realAbs, await realpath(root));
});

test("子目录可解析", async () => {
  const r = await inside(root, "sub");
  assert.equal(r.rel, "sub");
});

test("上级逃逸被拒绝", async () => {
  await assert.rejects(() => inside(root, ".."), (e) => e.code === "outside-workspace");
});

test("多层逃逸到 /etc 被拒绝", async () => {
  await assert.rejects(() => inside(root, "../../etc"), (e) => e.code === "outside-workspace");
});

test("绝对路径被拒绝", async () => {
  await assert.rejects(() => inside(root, "/etc/passwd"), (e) => e.code === "absolute-path");
});

test("Windows 风格绝对路径被拒绝", async () => {
  await assert.rejects(() => inside(root, "C:/windows"), (e) => e.code === "absolute-path");
});

test("指向工作区外的符号链接被拒绝", async () => {
  await symlink(outside, join(root, "link-out"));
  await assert.rejects(() => inside(root, "link-out"), (e) => e.code === "outside-workspace");
});

test("悬空符号链接仅允许在删除场景（mustExist:false）", async () => {
  await symlink(join(root, "nonexistent-target"), join(root, "dangling"));
  await assert.rejects(() => inside(root, "dangling"), (e) => e.code === "not-found");
  const r = await inside(root, "dangling", { mustExist: false });
  assert.equal(r.rel, "dangling");
});

test("不存在路径（非符号链接）即使 mustExist:false 也拒绝", async () => {
  await assert.rejects(() => inside(root, "ghost", { mustExist: false }), (e) => e.code === "not-found");
});
