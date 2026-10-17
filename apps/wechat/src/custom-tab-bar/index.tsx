import React from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.css'

export const TAB_ITEMS = [
  { route: 'pages/map/index', label: '地图', icon: '/assets/tabbar/map.png', active: '/assets/tabbar/map-active.png' },
  { route: 'pages/mix/index', label: '调酒', icon: '/assets/tabbar/mix.png', active: '/assets/tabbar/mix-active.png' },
  { route: 'pages/community/index', label: '社区', icon: '/assets/tabbar/community.png', active: '/assets/tabbar/community-active.png' },
  { route: 'pages/mine/index', label: '我的', icon: '/assets/tabbar/mine.png', active: '/assets/tabbar/mine-active.png' }
] as const

// The four native tabBar routes stay unchanged. '+' is only a custom component action.
export function actionDestination(index: number): { type: 'page' | 'tab'; url: string } | null {
  switch (index) {
    case 0: return { type: 'page', url: '/pages/journal-drink/index' }
    case 1: return { type: 'page', url: '/pages/journal-visit/index' }
    case 2: return { type: 'tab', url: '/pages/community/index' }
    default: return null
  }
}

export default class CustomTabBar extends React.Component<{}, { selected: number }> {
  state = { selected: 0 }
  setSelected(index: number): void {
    if (index >= 0 && index < TAB_ITEMS.length && this.state.selected !== index) {
      this.setState({ selected: index })
    }
  }
  private async openActions(): Promise<void> {
    try {
      // Native WeChat action sheet works above the Map native component and closes
      // without routing/unmounting the current tab or dropping its search/scroll state.
      const choice = await Taro.showActionSheet({
        itemList: ['记一杯酒', '记一次探店', '发布图文笔记']
      })
      const target = actionDestination(choice.tapIndex)
      if (!target) return
      if (target.type === 'tab') await Taro.switchTab({ url: target.url })
      else await Taro.navigateTo({ url: target.url })
    } catch (_) {
      // Native cancellation deliberately does not navigate or reset page state.
    }
  }
  render() {
    const first = TAB_ITEMS.slice(0, 2)
    const last = TAB_ITEMS.slice(2)
    const item = (entry: typeof TAB_ITEMS[number], index: number) =>
      <View className='jiuji-tab-item' key={entry.route}
        accessibilityRole='button' ariaLabel={entry.label}
        onClick={() => {
          if (this.state.selected !== index) void Taro.switchTab({ url: '/' + entry.route })
        }}>
        <Image className='jiuji-tab-icon' mode='aspectFit'
          src={this.state.selected === index ? entry.active : entry.icon} />
        <Text className={'jiuji-tab-label ' + (this.state.selected === index ? 'is-active' : '')}>
          {entry.label}
        </Text>
      </View>
    return <View className='jiuji-tab-bar'>
      {first.map((entry, index) => item(entry, index))}
      <View className='jiuji-tab-add' accessibilityRole='button' ariaLabel='打开记录与发布操作'
        onClick={() => void this.openActions()}>
        <View className='jiuji-tab-add-circle'><Text>＋</Text></View>
        <Text className='jiuji-tab-add-label'>记录</Text>
      </View>
      {last.map((entry, index) => item(entry, index + 2))}
    </View>
  }
}
