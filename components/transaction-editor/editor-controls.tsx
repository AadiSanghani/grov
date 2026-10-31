"use client"

import { useRef, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

export function submitOnShortcut(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  if (event.repeat || event.nativeEvent.isComposing || event.altKey) return
  event.currentTarget.requestSubmit()
}

export function useEditorFocus() {
  const previous = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus(event: Event) {
      previous.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      const amount = document.getElementById("amount")
      if (amount) {
        event.preventDefault()
        amount.focus()
      }
    },
    onCloseAutoFocus(event: Event) {
      if (previous.current?.isConnected) {
        event.preventDefault()
        previous.current.focus({ preventScroll: true })
      }
    },
  }
}

export function EditorFooter({
  pending,
  error,
  create = false,
  disabled = false,
}: {
  pending: boolean
  error: string
  create?: boolean
  disabled?: boolean
}) {
  return (
    <div className="sticky -bottom-6 z-10 -mx-6 border-t bg-background px-6 py-4">
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          ⌘ / Ctrl + Enter to save
        </span>
        {create && (
          <Button
            type="submit"
            name="intent"
            value="another"
            variant="outline"
            disabled={pending || disabled}
          >
            Save and add another
          </Button>
        )}
        <Button type="submit" disabled={pending || disabled}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : create ? (
            "Add transaction"
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>
  )
}
