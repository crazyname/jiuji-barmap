import React, { useMemo, useState } from 'react'
import { Button, Input, Map, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { favoriteIds, getVenues, priceText, ratingText, STATUS_LABEL, STATUS_OPTIONS,
  toggleFavorite, updateVenueLocation, validPoint, Venue } from '../../utils/venues'
import { filterVenues, hasTrustedLocation, INITIAL_VIEW, locationErrorMessage,
  transitionView, MapView } from './map-state'
import { refreshSites } from '../../services/sync'
import './index.css'

// Guangzhou is a browsing anchor, not an assertion of the user's current location.
const CENTER = { latitude: 23.12908, longitude: 113.26436 }
export default function MapPage() {
  const [venues, setVenues] = useState<Venue[]>(getVenues)
  const [query, setQuery] = useState('')
  const [statusIndex, setStatusIndex] = useState(0)
  const [view, setView] = useState<MapView>({ ...INITIAL_VIEW })
  const [center, setCenter] = useState(CENTER)
  const [scale, setScale] = useState(12)
  const [favorites, setFavorites] = useState<string[]>(favoriteIds)
  const [notice, setNotice] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Returning from venue details retains search, filter, sheet and map position.
  useDidShow(() => {
    setVenues(getVenues())
    setFavorites(favoriteIds())
    void reloadSites()
  })
  async function reloadSites(): Promise<void> {
    setRefreshing(true)
    try {
      const result = await refreshSites()
      setVenues(getVenues())
      setNotice(result.enabled && !result.ok ? '网络更新暂不可用，正在显示本机保存的酒吧资料。' : '')
    } catch (_) {
      setNotice('网络更新暂不可用，正在显示本机保存的酒吧资料。')
    } finally {
      setRefreshing(false)
    }
  }

  const displayed = useMemo(() =>
    filterVenues(venues, query, STATUS_OPTIONS[statusIndex].value),
    [venues, query, statusIndex])
  // Both a valid Guangzhou coordinate and verified provenance are required.
  const mapped = useMemo(() => displayed.filter(bar =>
    validPoint(bar.location) && hasTrustedLocation(bar)), [displayed])
  const selected = displayed.find(bar => bar.id === view.selectedId)
  const isMap = view.mode === 'map'
  const isExpanded = view.sheet === 'expanded'
  const canNavigate = hasTrustedLocation(selected)

  function changeQuery(text: string): void {
    setQuery(text)
    setView(current => transitionView(current, { type: 'filter' }))
  }
  function changeStatus(index: number): void {
    setStatusIndex(index)
    setView(current => transitionView(current, { type: 'filter' }))
  }
  function selectVenue(id: number): void {
    const bar = displayed.find(item => item.id === id)
    if (!bar) return
    setView(current => transitionView(current, { type: 'select', id }))
    if (hasTrustedLocation(bar) && validPoint(bar.location)) {
      setCenter(bar.location)
      setScale(15)
    }
  }
  function viewVenue(): void {
    if (selected) void Taro.navigateTo({ url: '/pages/venue/index?id=' + selected.id })
  }
  async function choosePoint(): Promise<void> {
    if (!selected) return
    try {
      const point = await Taro.chooseLocation({})
      const location = { latitude: point.latitude, longitude: point.longitude }
      if (!validPoint(location)) {
        await Taro.showToast({ title: '请选择广州试点范围内的地点', icon: 'none' })
        return
      }
      if (!updateVenueLocation(selected.id, location, point.address || '')) {
        await Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
        return
      }
      setVenues(getVenues())
      setCenter(location)
      setScale(15)
      await Taro.showToast({ title: '位置已保存', icon: 'success' })
    } catch (error) {
      if (!/cancel/i.test(String((error as { errMsg?: string })?.errMsg || ''))) {
        await Taro.showToast({ title: '地图选点未完成', icon: 'none' })
      }
    }
  }
  async function navigate(): Promise<void> {
    if (!selected || !hasTrustedLocation(selected) || !validPoint(selected.location)) {
      await Taro.showToast({ title: '地点坐标尚未核实', icon: 'none' })
      return
    }
    await Taro.openLocation({
      latitude: selected.location.latitude, longitude: selected.location.longitude,
      name: selected.name, address: selected.resolvedAddress || selected.addressHint || '', scale: 18
    })
  }
  async function locateMe(): Promise<void> {
    try {
      const location = await Taro.getLocation({ type: 'gcj02' })
      const point = { latitude: location.latitude, longitude: location.longitude }
      if (!validPoint(point)) {
        setNotice('当前位置不在广州试点范围，仍可浏览广州酒吧资料。')
        return
      }
      setCenter(point)
      setScale(14)
      setNotice('已定位到当前所在区域。酒吧列表不代表距离排序。')
      setView(current => transitionView(current, { type: 'clear' }))
    } catch (error) {
      setNotice(locationErrorMessage(error))
    }
  }
  function onFavorite(): void {
    if (!selected) return
    toggleFavorite(selected.id)
    setFavorites(favoriteIds())
  }
  function venueRow(bar: Venue) {
    const hasPoint = hasTrustedLocation(bar)
    return <View className='item' key={bar.id} onClick={() => selectVenue(bar.id)}>
      <View className='info'>
        <Text className='venueName'>{bar.name}</Text>
        <Text className='venueMeta'>{bar.station} · {STATUS_LABEL[bar.status]} · {priceText(bar)}</Text>
        {!hasPoint ? <Text className='locationPending'>坐标待核实 · 可查看资料</Text> : null}
      </View>
      <Text className='arrow'>›</Text>
    </View>
  }

  return <View className='layout'>
    <View className='toolbar'>
      <View className='searchStrip'>
        <Input className='search' placeholder='搜索酒吧、商圈、地铁站' confirmType='search'
          value={query} onInput={event => changeQuery(event.detail.value)} />
        <View className='modeSwitch' onClick={() => setView(current =>
          transitionView(current, { type: isMap ? 'show-list' : 'show-map' }))}>
          <Text>{isMap ? '列表' : '地图'}</Text>
        </View>
      </View>
      <ScrollView className='filterScroll' scrollX showScrollbar={false}>
        <View className='filterRow'>
          {STATUS_OPTIONS.map((option, index) =>
            <View className={'filterChip ' + (index === statusIndex ? 'filterChipActive' : '')}
              key={option.value} onClick={() => changeStatus(index)}>
              <Text>{option.text}</Text>
            </View>)}
        </View>
      </ScrollView>
      <View className='toolbarFoot'>
        <Text>资料收录状态，不代表实时营业</Text>
        <Text className='locateAction' onClick={() => void locateMe()}>定位</Text>
      </View>
    </View>

    {notice ? <View className='notice'>
      <Text>{notice}</Text>
      {notice.startsWith('网络更新') ? <Text className='retry' onClick={() => void reloadSites()}>
        {refreshing ? '更新中' : '重试'}
      </Text> : null}
    </View> : null}

    {isMap ? <>
      <Map className='map' latitude={center.latitude} longitude={center.longitude} scale={scale}
        enableScroll enableZoom enablePoi
        markers={mapped.map(bar => ({
          id: bar.id, latitude: bar.location!.latitude, longitude: bar.location!.longitude,
          width: 26, height: 26, iconPath: '/assets/pin.png'
        }))}
        onMarkerTap={event => selectVenue(Number(event.detail.markerId))} />
      <View className={'panel ' + (isExpanded ? 'panelExpanded' : 'panelCompact')}>
        <View className='panelHandle' />
        <View className='panelHeader'>
          <View className='panelTitleGroup'>
            {selected ? <Text className='backAction' onClick={() => setView(current =>
              transitionView(current, { type: 'clear' }))}>‹ 返回地图浏览</Text> : null}
            <Text className='panelTitle'>{selected ? selected.name : '广州酒吧'}</Text>
            <Text className='panelMeta'>找到 {displayed.length} 家 · 已核实点位 {mapped.length} 家</Text>
          </View>
          <Text className='panelToggle' onClick={() => setView(current =>
            transitionView(current, { type: isExpanded ? 'collapse' : 'expand' }))}>
            {isExpanded ? '收起 ↑' : '展开 ↓'}
          </Text>
        </View>
        {selected ? <>
          <View className='selectedInfo'>
            <Text className='meta'>{selected.station} · {STATUS_LABEL[selected.status]}</Text>
            <Text className='meta'>{ratingText(selected)}　{priceText(selected)}</Text>
            <Text className='locationPending'>{canNavigate ? '位置已核实' : '位置待核实，暂不可导航'}</Text>
            {isExpanded ? <>
              <Text className='addressLine'>{selected.resolvedAddress || selected.addressHint || '地址待补充'}</Text>
              <Text className='meta'>经营资料不代表正在营业；参考评价和价格以来源时效为准。</Text>
            </> : null}
          </View>
          <View className='actions'>
            <Button className='primary' onClick={viewVenue}>查看详情</Button>
            <Button className='secondary' onClick={onFavorite}>{favorites.includes(String(selected.id)) ? '已收藏' : '收藏'}</Button>
            <Button className='secondary' disabled={!canNavigate} onClick={() => void navigate()}>导航</Button>
          </View>
          {isExpanded ? <Text className='correctAction' onClick={() => void choosePoint()}>确认或纠正地图位置 ›</Text> : null}
        </> : <>
          {isExpanded ? <ScrollView scrollY className='panelList'>
            {displayed.map(venueRow)}
            {!displayed.length ? <View className='empty'>没有匹配的酒吧，请调整搜索词或筛选条件。</View> : null}
          </ScrollView> :
            <View className='previewList'>
              {displayed.slice(0, 2).map(venueRow)}
              {!displayed.length ? <View className='empty'>暂无匹配结果，请调整条件。</View> : null}
            </View>}
        </>}
      </View>
    </> : <ScrollView scrollY className='fullList'>
      <View className='listSummary'>共 {displayed.length} 家酒吧 · 仅核实坐标显示地图标记</View>
      {displayed.map(venueRow)}
      {!displayed.length ? <View className='empty'>没有匹配的酒吧，请调整搜索词或资料筛选。</View> : null}
      <View className='listFoot'>列表按原有资料顺序展示，并非距离或实时营业排名。</View>
    </ScrollView>}
  </View>
}
