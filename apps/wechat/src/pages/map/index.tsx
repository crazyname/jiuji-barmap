import React, { useMemo, useState } from 'react'
import { Button, Input, Map, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getVenues, priceText, ratingText, STATUS_LABEL, STATUS_OPTIONS, updateVenueLocation, validPoint, Venue } from '../../utils/venues'
import './index.css'

const CENTER = { latitude: 23.12908, longitude: 113.26436 }
export default function MapPage() {
  const [venues, setVenues] = useState<Venue[]>(getVenues)
  const [query, setQuery] = useState('')
  const [statusIndex, setStatusIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [center, setCenter] = useState(CENTER)
  const [scale, setScale] = useState(12)
  const [expanded, setExpanded] = useState(true)
  useDidShow(() => setVenues(getVenues()))

  const displayed = useMemo(() => {
    const filter = STATUS_OPTIONS[statusIndex].value
    const key = query.trim().toLocaleLowerCase()
    return venues.filter(bar =>
      (filter === 'all' || filter === bar.status) &&
      (!key || (bar.name + ' ' + bar.station + ' ' + (bar.searchKey || '')).toLocaleLowerCase().includes(key)))
  }, [venues, query, statusIndex])
  const mapped = useMemo(() => displayed.filter(bar => validPoint(bar.location)), [displayed])
  const selected = venues.find(bar => bar.id === selectedId)
  function selectVenue(id: number): void {
    const bar = venues.find(item => item.id === id)
    if (!bar) return
    setSelectedId(id)
    if (validPoint(bar.location)) { setCenter(bar.location); setScale(15) }
  }
  function viewVenue(): void {
    if (selected) void Taro.navigateTo({ url: '/pages/venue/index?id=' + selected.id })
  }
  async function choosePoint(): Promise<void> {
    if (!selected) return
    try {
      const point = await Taro.chooseLocation({})
      const location = { latitude: point.latitude, longitude: point.longitude }
      if (!validPoint(location)) { await Taro.showToast({ title: '请选择广州附近的酒吧', icon: 'none' }); return }
      if (!updateVenueLocation(selected.id, location, point.address || '')) return
      setVenues(getVenues())
      setCenter(location)
      setScale(15)
      await Taro.showToast({ title: '位置已保存', icon: 'success' })
    } catch (err) {
      if (!/cancel/i.test(String((err as { errMsg?: string })?.errMsg || ''))) {
        await Taro.showToast({ title: '地图选点未完成', icon: 'none' })
      }
    }
  }
  async function navigate(): Promise<void> {
    if (!selected || !validPoint(selected.location)) {
      await Taro.showToast({ title: '请先确认地图位置', icon: 'none' }); return
    }
    await Taro.openLocation({
      latitude: selected.location.latitude, longitude: selected.location.longitude,
      name: selected.name, address: selected.resolvedAddress || selected.addressHint || '', scale: 18
    })
  }
  return <View className='layout'>
    <View className='toolbar'>
      <Text className='eyebrow'>JIUJI / BAR MAP</Text>
      <Text className='headline'>酒迹 · 城市酒吧地图</Text>
      <Input className='search' placeholder='搜索酒吧、地铁站或名称' value={query}
        onInput={event => setQuery(event.detail.value)} />
      <View className='filterRow'>
        <Picker mode='selector' range={STATUS_OPTIONS.map(option => option.text)} value={statusIndex}
          onChange={event => setStatusIndex(Number(event.detail.value))}>
          <View className='filter'>{STATUS_OPTIONS[statusIndex].text} ▾</View>
        </Picker>
        <Text className='filterHint'>营业资料等级，不代表实时营业</Text>
      </View>
    </View>
    <Map className='map' latitude={center.latitude} longitude={center.longitude} scale={scale}
      enableScroll enableZoom enablePoi
      markers={mapped.map(bar => ({
        id: bar.id, latitude: bar.location!.latitude, longitude: bar.location!.longitude,
        width: 26, height: 26, iconPath: '/assets/pin.png'
      }))}
      onMarkerTap={event => selectVenue(Number(event.detail.markerId))} />
    {selected ? <View className='selected'>
      <Text className='smallLabel'>JIUJI / SELECTED PLACE</Text>
      <Text className='selectedName'>{selected.name}</Text>
      <Text className='meta'>{selected.station} · {STATUS_LABEL[selected.status]}</Text>
      <Text className='meta'>{ratingText(selected)}　{priceText(selected)}</Text>
      <View className='actions'>
        <Button size='mini' className='secondary' onClick={viewVenue}>详情</Button>
        <Button size='mini' className='secondary' onClick={() => void choosePoint()}>确认位置</Button>
        <Button size='mini' className='primary' disabled={!validPoint(selected.location)} onClick={() => void navigate()}>导航</Button>
      </View>
    </View> : null}
    <View className='count'>
      <Text>找到 {displayed.length} 家 · 地图已定位 {mapped.length} 家</Text>
      <Text className='expand' onClick={() => setExpanded(!expanded)}>{expanded ? '收起 ↑' : '展开 ↓'}</Text>
    </View>
    {expanded ? <ScrollView scrollY className='list'>
      {displayed.map(bar => <View className='item' key={bar.id} onClick={() => selectVenue(bar.id)}>
        <View className='info'>
          <Text className='venueName'>{bar.name}</Text>
          <Text className='venueMeta'>{bar.station} · {STATUS_LABEL[bar.status]} · {priceText(bar)}</Text>
        </View>
        <Text className='arrow'>›</Text>
      </View>)}
      {!displayed.length ? <View className='empty'>没有匹配的酒吧，请调整筛选条件。</View> : null}
    </ScrollView> : null}
  </View>
}
