import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { JSDOM } = require("jsdom");
const source = readFileSync(new URL("./HomeHero.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const exports: Record<string, unknown> = {};
new Function("require", "exports", compiled)((specifier: string) => {
  if (specifier === "@/features/home/homeData") return require("./homeData.ts");
  return require(specifier);
}, exports);

function renderNeeds(loading: boolean, selectedNeedIds: string[] = []) {
  const html = renderToStaticMarkup(
    React.createElement(exports.HomeNeedsPicker, {
      easyMode: false,
      experience: {
        auth: { loading },
        selectedNeedIds,
        toggleNeed() {},
        clearNeeds() {}
      }
    })
  );
  return new JSDOM(html).window.document;
}

test("auth loading preserves the final help form and disables its controls", () => {
  const pending = renderNeeds(true);
  const ready = renderNeeds(false);
  const controlNames = (doc: Document) =>
    Array.from(doc.querySelectorAll("button, input")).map(
      (node) =>
        node.getAttribute("aria-label") || node.textContent?.trim() || node.getAttribute("type")
    );
  assert.ok(ready.querySelectorAll("button, input").length >= 6);
  assert.deepEqual(controlNames(pending), controlNames(ready));
  assert.equal(pending.querySelectorAll("button:not(:disabled), input:not(:disabled)").length, 0);
  assert.equal(pending.querySelector("#home-needs")?.getAttribute("aria-busy"), "true");
  assert.equal(
    pending.querySelector("#needs-title")?.textContent,
    ready.querySelector("#needs-title")?.textContent
  );
});

test("saved help preferences do not mount a new reset control after authentication", () => {
  const pending = renderNeeds(true);
  const ready = renderNeeds(false, ["step_free"]);
  const resetButton = (doc: Document) =>
    Array.from(doc.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "선택 초기화"
    );
  const pendingReset = resetButton(pending);
  const readyReset = resetButton(ready);
  assert.ok(pendingReset);
  assert.ok(readyReset);
  assert.equal(pendingReset.disabled, true);
  assert.equal(pendingReset.classList.contains("invisible"), true);
  assert.equal(pendingReset.classList.contains("hidden"), false);
  assert.equal(pendingReset.getAttribute("aria-hidden"), "true");
  assert.equal(readyReset.disabled, false);
  assert.equal(readyReset.classList.contains("invisible"), false);
  assert.equal(
    pending.querySelectorAll("button, input").length,
    ready.querySelectorAll("button, input").length
  );
});
