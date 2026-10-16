import React, { useMemo, useState } from 'react'
import { Input, Map, Text, View } from '@tarojs/components'
import seed from '../../data/bars.json'
import './index.css'

type Bar = { id: number; name: string; station: string; status: string; location: { latitude: number; longitude: number } | null }
const bars = seed as Bar[]
export default function MapPage() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const shown = useMemo(() => bars.filter(b => (b.name + b.station).toLowerCase().includes(query.toLowerCase())), [query])
  const mapped = shown.filter(b => b.location != null)
  const selected = bars.find(b => b.id === selectedId)
  return <View className='layout'>
    <View className='toolbar'>
      <Text className='eyebrow'>JIUJI / BAR MAP</Text>
      <Text className='headline'>城市酒吧地图</Text>
      <Input className='search' placeholder='搜索酒吧、商圈、地铁站' value={query} onInput={e => setQuery(e.detail.value)} />
    </View>
    <Map className='map' latitude={23.12908} longitude={113.26436} scale={12}
      enableScroll enableZoom enablePoi
      markers={mapped.map(b => ({ id:b.id, latitude:b.location!.latitude, longitude:b.location!.longitude,
        width:26, height:26, iconPath:'/assets/pin.png' }))}
      onMarkerTap={e => setSelectedId(e.detail.markerId)} />
    {selected ? <View className='selected'><Text>{selected.name}</Text><Text>{selected.station}</Text></View> : null}
    <View className='count'>找到 {shown.length} 家酒吧 · 已确认坐标 {mapped.length} 家</View>
    <View className='list'>{shown.slice(0,8).map(b => <View className='item' key={b.id}
      onClick={() => setSelectedId(b.id)}><Text>{b.name}</Text><Text>{b.station}</Text></View>)}</View>
  </View>
}
