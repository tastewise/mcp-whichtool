import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./support/msw";

// jsdom has no <dialog> methods; the drawers call them.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute("open"); };
}
// jsdom lays nothing out, so it has nothing to scroll: the docs page scrolls to an anchor.
Element.prototype.scrollIntoView ??= function () {};
window.scrollTo = () => {};
// jsdom has no ResizeObserver; Radix measures a tooltip's arrow with one.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());

// jsdom's Blob is read through FileReader only; every browser the page runs in has these two.
function readAs<T>(blob: Blob, how: "readAsText" | "readAsArrayBuffer"): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error);
    reader[how](blob);
  });
}
Blob.prototype.text ??= function (this: Blob) { return readAs<string>(this, "readAsText"); };
Blob.prototype.arrayBuffer ??= function (this: Blob) { return readAs<ArrayBuffer>(this, "readAsArrayBuffer"); };
