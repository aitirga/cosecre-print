import type { CosecrePrintApi } from '@shared/types'

declare global {
  interface Window {
    cosecrePrint: CosecrePrintApi
  }
}

export {}
