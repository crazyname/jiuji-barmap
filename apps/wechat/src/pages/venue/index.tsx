import React, { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { addVenueVisit, favoriteIds, getVenues, priceText, ratingText, STATUS_LABEL,
  toggleFavorite, updateVenueLocation, validPoint, Venue } from '../../utils/venues'
import './index.css'

export default function VenuePage() {
  const router = useRouter()
  const id = Number(router.params.id)
  const [venue, setVenue] = useState<Venue | undefined>(() => getVenues().find(item => item.id === id))
  const [favorite, setFavorite] = useState(false)
  useDidShow(() => {
    setVenue(getVenues().find(item => item.id === id))
    setFavorite(favoriteIds().includes(String(id)))
    if (Number.isInteger(id) && id > 0) addVenueVisit(id)
  })
  async function choosePoint(): Promise<void> {
    if (!venue) return
    try {
      const place = await Taro.chooseLocation({})
      const point = { latitude: place.latitude, longitude: place.longitude }
      if (!validPoint(point)) { await Taro.showToast({ title: '请选择广州附近的地点', icon: 'none' }); return }
      if (!updateVenueLocation(id, point, place.address || '')) {
        await Taro.showToast({ title: '保存失败', icon: 'none' }); return
      }
      setVenue(getVenues().find(item => item.id === id))
      await Taro.showToast({ title: '位置已保存', icon: 'success' })
    } catch (err) {
      if (!/cancel/i.test(String((err as { errMsg?: string })?.errMsg || ''))) {
        await Taro.showToast({ title: '地图选点未完成', icon: 'none' })
      }
    }
  }
  async function openLocation(): Promise<void> {
    if (!venue || !validPoint(venue.location)) return
    await Taro.openLocation({
      latitude: venue.location.latitude, longitude: venue.location.longitude, scale: 18,
      name: venue.name, address: venue.resolvedAddress || venue.addressHint || ''
    })
  }
  function onFavorite(): void {
    if (!venue) return
    setFavorite(toggleFavorite(venue.id))
  }
  if (!venue) return <View className='detail'><Text>没有找到这家酒吧。</Text></View>
  return <View className='detail'>
    <Text className='eyebrow'>JIUJI / PLACES / {venue.id}</Text>
    <Text className='heading'>{venue.name}</Text>
    <Text className='subtitle'>广州 · {venue.station} · {venue.exit || '—'} 出口</Text>
    <View className='stats'>
      <View className='stat'><Text className='label'>平台用户评分</Text><Text className='number'>{ratingText(venue)}</Text></View>
      <View className='stat'><Text className='label'>参考人均消费</Text><Text className='number'>{priceText(venue)}</Text></View>
    </View>
    <View className='card'>
      <Text className='section'>经营与位置</Text>
      <View className='line'><Text>营业资料</Text><Text>{STATUS_LABEL[venue.status]}</Text></View>
      <View className='line'><Text>附近地铁站</Text><Text>{venue.station}</Text></View>
      <View className='line'><Text>地图坐标</Text><Text>{validPoint(venue.location) ? '位置已确认' : '待确认'}</Text></View>
      {venue.resolvedAddress || venue.addressHint ? <Text className='address'>{venue.resolvedAddress || venue.addressHint}</Text> : null}
      <Text className='notice'>经营记录不代表实时营业；地图地点请以现场与商家信息为准。</Text>
    </View>
    <Button className='primary' disabled={!validPoint(venue.location)} onClick={() => void openLocation()}>打开地图导航</Button>
    <Button className='secondary' onClick={() => void choosePoint()}>
      {validPoint(venue.location) ? '纠正地图位置' : '在地图中确认位置'}
    </Button>
    <Button className='secondary' onClick={onFavorite}>{favorite ? '♥ 已收藏' : '♡ 收藏这家酒吧'}</Button>
  </View>
}
