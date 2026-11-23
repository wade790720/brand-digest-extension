import { useSyncExternalStore } from 'react'
import { getLang, subscribeLang } from '@/lib/i18n'

export const useLang = () => useSyncExternalStore(subscribeLang, getLang)
