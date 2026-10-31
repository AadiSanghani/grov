export function shouldOpenTransaction(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.key.toLowerCase() !== "n"
  )
    return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"], [data-slot="popover-content"][data-state="open"], [role="listbox"]'
    )
  )
    return false
  const target = event.target
  return !(
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"]'
      ))
  )
}
