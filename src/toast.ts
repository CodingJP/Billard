type Listener = (message: string) => void
const listeners = new Set<Listener>()

/** Shows a short confirmation at the bottom of the screen. */
export function toast(message: string) {
  for (const l of listeners) l(message)
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
