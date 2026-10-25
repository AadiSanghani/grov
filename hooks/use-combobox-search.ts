"use client"

import { useRef, useState, type KeyboardEvent } from "react"

interface ComboboxSearchOptions {
  search?: string
  onSearchChange?: (value: string) => void
}

export function useComboboxSearch(options: ComboboxSearchOptions = {}) {
  const [open, setOpenState] = useState(false)
  const [internalSearch, setInternalSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const openedByTyping = useRef(false)
  const search = options.search ?? internalSearch

  function setSearch(value: string) {
    if (options.onSearchChange) {
      options.onSearchChange(value)
    } else {
      setInternalSearch(value)
    }
  }

  function setOpen(nextOpen: boolean) {
    setOpenState(nextOpen)
    if (!nextOpen) {
      openedByTyping.current = false
      setInternalSearch("")
    }
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      event.defaultPrevented ||
      event.ctrlKey || event.metaKey || event.altKey ||
      event.nativeEvent.isComposing
    ) return

    if (event.key.length === 1 && event.key !== " ") {
      event.preventDefault()
      openedByTyping.current = true
      setSearch(event.key)
      setOpen(true)
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
    }
  }

  function onOpenAutoFocus(event: Event) {
    const input = inputRef.current
    if (!openedByTyping.current || !input) return

    // Radix normally selects the input text on focus. Keep the first typed
    // character and put the caret after it so the next key appends to the query.
    event.preventDefault()
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    openedByTyping.current = false
  }

  return { open, setOpen, search, setSearch, inputRef, onTriggerKeyDown, onOpenAutoFocus }
}
