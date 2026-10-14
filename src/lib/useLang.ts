import { useSyncExternalStore } from 'react'
import { getLang, subscribeLang } from '@/lib/i18n'

/** 元件呼叫它，切換語言時就會重畫 */
export const useLang = () => useSyncExternalStore(subscribeLang, getLang)
