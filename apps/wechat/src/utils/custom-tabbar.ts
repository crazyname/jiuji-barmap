import Taro, { useDidShow } from '@tarojs/taro'

/** Each custom-tab-bar instance is page-scoped; update selection every time tab shows. */
export function useSyncCustomTabBar(index: number): void {
  useDidShow(() => {
    const page = Taro.getCurrentInstance().page
    if (!page) return
    const bar = Taro.getTabBar(page) as { setSelected?: (index: number) => void } | null
    bar?.setSelected?.(index)
  })
}
