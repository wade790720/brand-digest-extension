import { vi } from 'vitest'

const ls: Record<string, string> = {}
Object.defineProperties(ls, {
  getItem: { value: (k: string) => ls[k] ?? null },
  setItem: { value: (k: string, v: string) => void (ls[k] = v) },
  removeItem: { value: (k: string) => void delete ls[k] },
})
vi.stubGlobal('localStorage', ls)
vi.stubGlobal('dispatchEvent', () => true)

export const mem = {
  get: (k: string) => ls[k],
  set: (k: string, v: unknown) => void (ls[k] = typeof v === 'string' ? v : JSON.stringify(v)),
  json: (k: string) => JSON.parse(ls[k]),
  has: (k: string) => k in ls,
  clear: () => Object.keys(ls).forEach((k) => delete ls[k]),
}
