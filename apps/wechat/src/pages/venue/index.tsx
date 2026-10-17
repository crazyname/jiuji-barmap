import React, { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { addVenueVisit, favoriteIds, getVenues, priceText, ratingText, STATUS_LABEL,
  toggleFavorite, updateVenueLocation, validPoint, Venue } from '../../utils/venues'
import { hasTrustedLocation } from '../map/map-state'
import './index.css'

export default function VenuePage() {
  const router = useRouter()
  const id = Number(router.params.id)
  const [venue, setVenue] = useState<Venue | undefined>(() => getVenues().find(item => item.id === id))
  const [favorite, setFavorite] = useState(false)
  useDidShow(() => {
    setVenue(getVenues().find(item => item.id === id))
    setFavorite(favoriteIds().includes(String(id)))
    // Historical browse log only: viewing a detail page is never a visit session.
    if (Number.isInteger(id) && id > 0) addVenueVisit(id)
  })
  async function choosePoint(): Promise<void> {
    if (!venue) return
    try {
      const place = await Taro.chooseLocation({})
      const point = { latitude: place.latitude, longitude: place.longitude }
      if (!validPoint(point)) {
        await Taro.showToast({ title: '请选择广州试点范围内的地点', icon: 'none' })
        return
      }
      if (!updateVenueLocation(id, point, place.address || '')) {
        await Taro.showToast({ title: '保存失败', icon: 'none' })
        return
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
    if (!venue || !hasTrustedLocation(venue) || !validPoint(venue.location)) {
      await Taro.showToast({ title: '地点坐标尚未核实', icon: 'none' })
      return
    }
    await Taro.openLocation({
      latitude: venue.location.latitude, longitude: venue.location.longitude, scale: 18,
      name: venue.name, address: venue.resolvedAddress || venue.addressHint || ''
    })
  }
  function onFavorite(): void {
    if (!venue) return
    setFavorite(toggleFavorite(venue.id))
  }
  if (!venue) return <View className='detail'>
    <Text className='empty'>没有找到这家酒吧，请返回地图重新选择。</Text>
  </View>
  const located = hasTrustedLocation(venue)
  const locationLabel = !located ? '地图位置待核实' : venue.locationSource === 'user-map-selection'
    ? '用户手动标记 · 未经平台核实' : '地图位置来源已核实'
  return <View className='detail'>
    <View className='hero'>
      <Text className='heading'>{venue.name}</Text>
      <Text className='subtitle'>广州 · {venue.station}{venue.exit ? ' · ' + venue.exit + ' 出口' : ''}</Text>
      <Text className='status'>{STATUS_LABEL[venue.status]} · {locationLabel}</Text>
    </View>
    <View className='actionGroup'>
      <Button className='primary' disabled={!located} onClick={() => void openLocation()}>地图导航</Button>
      <Button className='secondary' onClick={onFavorite}>{favorite ? '♥ 已收藏' : '♡ 收藏酒吧'}</Button>
    </View>
    <View className='card'>
      <Text className='section'>位置与资料</Text>
      <View className='addressBlock'>
        <Text className='fieldLabel'>{venue.resolvedAddress ? '已选择的地图地址' : '参考地址'}</Text>
        <Text className='address'>{venue.resolvedAddress || venue.addressHint || '暂无可用地址'}</Text>
      </View>
      <View className='line'><Text>附近地铁</Text><Text>{venue.station}</Text></View>
      <View className='line'><Text>资料状态</Text><Text>{STATUS_LABEL[venue.status]}</Text></View>
      <View className='line'><Text>地图坐标</Text><Text>{locationLabel}</Text></View>
      {venue.statusCheckedAt ? <View className='line'><Text>资料检查日期</Text><Text>{venue.statusCheckedAt}</Text></View> : null}
      <Button className='correctButton' onClick={() => void choosePoint()}>
        {located ? '纠正地图位置' : '在微信地图中确认位置'}
      </Button>
    </View>
    <View className='card'>
      <Text className='section'>参考信息</Text>
      <View className='line'><Text>参考人均消费</Text><Text>{priceText(venue)}</Text></View>
      <View className='line'><Text>平台用户评分</Text><Text>{ratingText(venue)}</Text></View>
      <Text className='notice'>评分和价格仅在原始资料包含数据时展示；并非酒迹实时核实的营业或预约信息。</Text>
    </View>
    <Text className='footerNote'>经营资料不代表实时营业。浏览酒吧详情只会加入本机浏览记录，不代表实际探店。</Text>
  </View>
}
