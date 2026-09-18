import type { TermlessApi } from '../shared/types'

declare global {
  interface Window {
    termless: TermlessApi & { onInventoryChanged(listener: () => void): () => void }
  }
}

export {}
