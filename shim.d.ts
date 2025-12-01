import type { ProtocolWithReturn } from 'webext-bridge'
import type { Mark } from '~/logic/storage'

declare module 'webext-bridge' {
  export interface ProtocolMap {
    // define message protocol types
    // see https://github.com/antfu/webext-bridge#type-safe-protocols
    'tab-prev': { title: string | undefined }
    'get-current-tab': ProtocolWithReturn<{ tabId: number }, { title?: string }>
    'get-marks-for-url': ProtocolWithReturn<{ url: string }, Mark[]>
    'add-mark': Mark
    'goto-mark': { markId: string }
    'remove-mark': Mark
    'get-mark-by-id': ProtocolWithReturn<{ id: string; url: string }, Mark>
  }
}
// Manually declare the 'rangy' module shape because @types/rangy is incomplete
declare module 'rangy' {
  interface RangyClassApplier {
    applyToSelection(selection?: RangySelection): void
    undoToSelection(selection?: RangySelection): void
    toggleSelection(selection?: RangySelection): void
  }

  interface RangyStatic {
    init(): void
    getSelection(win?: Window): import('rangy/lib/rangy-core').RangySelection
    createClassApplier(theClass: string, options?: any, tagNames?: string[] | string): RangyClassApplier
    serializeSelection(selection?: RangySelection, omitChecksum?: boolean, rootNode?: Node): string
    deserializeSelection(serialized: string, rootNode?: Node, win?: Window): void
    createRange(): import('rangy/lib/rangy-core').RangyRange
  }

  const rangy: RangyStatic
  export default rangy
}
