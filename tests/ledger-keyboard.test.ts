import { afterEach, describe, expect, it } from "vitest"
import { shouldOpenTransaction } from "@/lib/ledger/keyboard"
afterEach(() => {
  document.body.innerHTML = ""
})
function key(options: KeyboardEventInit = {}, target = document.body) {
  const event = new KeyboardEvent("keydown", {
    key: "n",
    bubbles: true,
    cancelable: true,
    ...options,
  })
  target.dispatchEvent(event)
  return event
}
describe("new transaction shortcut", () => {
  it("opens for N only when no overlay or typing is active", () => {
    expect(shouldOpenTransaction(key())).toBe(true)
    for (const options of [
      { repeat: true },
      { isComposing: true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
    ])
      expect(shouldOpenTransaction(key(options))).toBe(false)
    const input = document.createElement("input")
    document.body.append(input)
    expect(shouldOpenTransaction(key({}, input))).toBe(false)
    const editor = document.createElement("div")
    editor.contentEditable = "true"
    editor.setAttribute("contenteditable", "true")
    document.body.append(editor)
    expect(shouldOpenTransaction(key({}, editor))).toBe(false)
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.dataset.state = "open"
    document.body.append(dialog)
    expect(shouldOpenTransaction(key())).toBe(false)
  })
})
