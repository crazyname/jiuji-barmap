import React, { useMemo, useState } from 'react'
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import seed from './src/data/bars.json'
import sitesData from './src/data/sites-test.json'

type Tab = 'map' | 'mix' | 'community' | 'mine'
type Bar = {id:number;name:string;station:string;location:{latitude:number;longitude:number}|null}
const tabs:{id:Tab;label:string}[]=[{id:'map',label:'地图'},{id:'mix',label:'调酒'},{id:'community',label:'社区'},{id:'mine',label:'我的'}]
const bars=seed as Bar[]
export default function App() {
 const [tab,setTab]=useState<Tab>('map')
 const [query,setQuery]=useState('')
 const filtered=useMemo(()=>bars.filter(b=>(b.name+' '+b.station).toLowerCase().includes(query.toLowerCase())),[query])
 const markers=filtered.filter(b=>b.location!==null)
 return <SafeAreaView style={s.root}>
  <View style={s.header}><Text style={s.overline}>JIUJI / BAR MAP</Text><Text style={s.title}>酒迹 · {tabs.find(t=>t.id===tab)?.label}</Text></View>
  {tab==='map'?<View style={s.flex}>
    <TextInput style={s.input} placeholder='搜索酒吧、商圈、地铁站' value={query} onChangeText={setQuery}/>
    <MapView style={s.map} initialRegion={{latitude:23.12908,longitude:113.26436,latitudeDelta:0.11,longitudeDelta:0.11}}>
     {markers.map(b=><Marker key={b.id} coordinate={b.location!} title={b.name}/>)}
    </MapView>
    <Text style={s.hint}>酒吧 {filtered.length} 家 · 坐标已确认 {markers.length} 家</Text>
    <ScrollView style={s.list}>{filtered.slice(0,20).map(b=><View style={s.row} key={b.id}><Text style={s.body}>{b.name}</Text><Text style={s.sub}>{b.station}</Text></View>)}</ScrollView>
  </View>:<View style={s.flex}><Text style={s.body}>{tab==='mix'?'调酒教程':tab==='community'?'探店、品酒和推广帖子':'个人资料、收藏与设置'}</Text>
   {tab==='mix'?sitesData.recipes.map(r=><View key={r.id} style={s.row}><Text style={s.body}>{r.title}</Text><Text style={s.sub}>{r.ingredients}</Text></View>)
     :tab==='community'?sitesData.posts.map(p=><View key={p.id} style={s.row}><Text style={s.body}>{p.type==='promo'?'【广告】':''}{p.title}</Text><Text style={s.sub}>{p.body}</Text></View>)
     :<Text style={s.sub}>个人资料与收藏将在下一阶段迁移。</Text>}</View>}
  <View style={s.tabs}>{tabs.map(t=><TouchableOpacity key={t.id} style={s.tab} onPress={()=>setTab(t.id)}>
   <Text style={[s.tabText,tab===t.id&&s.active]}>{t.label}</Text></TouchableOpacity>)}</View>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#f4eddf'},header:{padding:16,backgroundColor:'#f9f4eb'},overline:{fontSize:10,letterSpacing:2,color:'#82442f'},title:{fontSize:24,fontWeight:'700',color:'#35291f'},flex:{flex:1,padding:12},input:{backgroundColor:'#f9f4eb',padding:12,borderRadius:8,marginBottom:10},map:{height:280,width:'100%'},hint:{paddingVertical:10,color:'#887969'},list:{flex:1},row:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#d8c7b5'},body:{fontSize:15,color:'#35291f'},sub:{fontSize:12,color:'#887969'},tabs:{display:'flex',flexDirection:'row',borderTopWidth:1,borderTopColor:'#d8c7b5',backgroundColor:'#f9f4eb'},tab:{flex:1,padding:18,alignItems:'center'},tabText:{fontSize:14,color:'#887969'},active:{color:'#82442f',fontWeight:'700'}})
