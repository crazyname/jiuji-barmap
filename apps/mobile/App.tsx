import React, { useEffect, useMemo, useState } from 'react'
import { AppState, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import seed from './src/data/bars.json'
import sitesData from './src/data/sites-test.json'
import { getMobileRows, queueMobileUpsert, refreshMobileSites } from './src/services/sync'

type Tab = 'map' | 'mix' | 'community' | 'mine'
type Bar = { id:number; name:string; station:string; location:{latitude:number;longitude:number}|null }
type Recipe = { id:string; title:string; ingredients:string; steps:string; visibility:string }
type Post = { id:string; title:string; body:string; type:string; visibility:string; isSponsored:boolean; sponsorName:string|null }
const tabs:{id:Tab;label:string}[]=[{id:'map',label:'地图'},{id:'mix',label:'调酒'},{id:'community',label:'社区'},{id:'mine',label:'我的'}]
const initialBars=seed as Bar[]
const demoRecipes=sitesData.recipes as Recipe[]
const demoPosts=sitesData.posts as Post[]
export default function App() {
 const [tab,setTab]=useState<Tab>('map')
 const [query,setQuery]=useState('')
 const [bars,setBars]=useState<Bar[]>(initialBars)
 const [recipes,setRecipes]=useState<Recipe[]>(demoRecipes)
 const [posts,setPosts]=useState<Post[]>(demoPosts)
 const [title,setTitle]=useState('')
 const [body,setBody]=useState('')
 const [syncMessage,setSyncMessage]=useState('本机模式')
 const [pending,setPending]=useState(0)
 async function refresh(){
  const result=await refreshMobileSites()
  const [remoteBars,remoteRecipes,remotePosts]=await Promise.all([
    getMobileRows<Bar>('bars'),getMobileRows<Recipe>('recipes'),getMobileRows<Post>('posts')
  ])
  setBars(remoteBars.length?remoteBars:initialBars)
  setRecipes(remoteRecipes.length?remoteRecipes:demoRecipes)
  setPosts(remotePosts.length?remotePosts:demoPosts)
  setSyncMessage(result.message)
  setPending(result.queued)
 }
 useEffect(()=>{
   void refresh()
   const subscription=AppState.addEventListener('change',state=>{
     if(state==='active')void refresh()
   })
   return ()=>subscription.remove()
 },[])
 const filtered=useMemo(()=>bars.filter(b=>(b.name+' '+b.station).toLowerCase().includes(query.toLowerCase())),[bars,query])
 const markers=filtered.filter(b=>b.location!==null)
 async function saveDraft(kind:'recipes'|'posts'){
  if(!title.trim()||!body.trim())return
  const id='draft-'+Date.now()+'-'+Math.random().toString(36).slice(2,6)
  if(kind==='recipes'){
   const recipe:Recipe={id,title:title.trim(),ingredients:'自行补充',steps:body.trim(),visibility:'private'}
   await queueMobileUpsert('recipes',recipe)
   setRecipes(old=>[recipe,...old])
  }else{
   const post:Post={id,title:title.trim(),body:body.trim(),type:'visit',visibility:'private',isSponsored:false,sponsorName:null}
   await queueMobileUpsert('posts',post)
   setPosts(old=>[post,...old])
  }
  setTitle('');setBody('')
  await refresh()
 }
 return <SafeAreaView style={s.root}>
  <View style={s.header}><Text style={s.overline}>JIUJI / BAR MAP</Text><Text style={s.title}>酒迹 · {tabs.find(t=>t.id===tab)?.label}</Text></View>
  {tab==='map'?<View style={s.flex}>
    <TextInput style={s.input} placeholder='搜索酒吧、商圈、地铁站' value={query} onChangeText={setQuery}/>
    <MapView style={s.map} initialRegion={{latitude:23.12908,longitude:113.26436,latitudeDelta:0.11,longitudeDelta:0.11}}>
     {markers.map(b=><Marker key={b.id} coordinate={b.location!} title={b.name}/>)}
    </MapView>
    <Text style={s.hint}>酒吧 {filtered.length} 家 · 坐标已确认 {markers.length} 家</Text>
    <ScrollView style={s.list}>{filtered.slice(0,20).map(b=><View style={s.row} key={b.id}><Text style={s.body}>{b.name}</Text><Text style={s.sub}>{b.station}</Text></View>)}</ScrollView>
  </View>:<View style={s.flex}>
   {tab==='mix'||tab==='community'?<>
     <TextInput style={s.input} placeholder={tab==='mix'?'配方名称':'探店笔记标题'} value={title} onChangeText={setTitle}/>
     <TextInput style={s.input} placeholder={tab==='mix'?'调酒步骤':'探店正文'} value={body} onChangeText={setBody} multiline/>
     <TouchableOpacity style={s.button} onPress={()=>void saveDraft(tab==='mix'?'recipes':'posts')}>
       <Text style={s.buttonLabel}>保存私人草稿 · 加入同步队列</Text>
     </TouchableOpacity>
     <ScrollView>{tab==='mix'?recipes.map(r=><View key={r.id} style={s.row}><Text style={s.body}>{r.title}</Text><Text style={s.sub}>{r.ingredients}</Text></View>)
      :posts.map(p=><View key={p.id} style={s.row}><Text style={s.body}>{p.isSponsored?'【广告】':''}{p.title}</Text><Text style={s.sub}>{p.body}</Text></View>)}</ScrollView>
    </>:<View>
       <Text style={s.body}>统一测试数据服务</Text>
       <Text style={s.sub}>{syncMessage} · 待上传 {pending} 条</Text>
       <TouchableOpacity style={s.button} onPress={()=>void refresh()}><Text style={s.buttonLabel}>立即刷新</Text></TouchableOpacity>
    </View>}
  </View>}
  <View style={s.tabs}>{tabs.map(t=><TouchableOpacity key={t.id} style={s.tab} onPress={()=>{setTab(t.id);void refresh()}}>
   <Text style={[s.tabText,tab===t.id&&s.active]}>{t.label}</Text></TouchableOpacity>)}</View>
 </SafeAreaView>
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:'#f4eddf'},header:{padding:16,backgroundColor:'#f9f4eb'},
 overline:{fontSize:10,letterSpacing:2,color:'#82442f'},title:{fontSize:24,fontWeight:'700',color:'#35291f'},
 flex:{flex:1,padding:12},input:{backgroundColor:'#f9f4eb',padding:12,borderRadius:8,marginBottom:10},
 map:{height:280,width:'100%'},hint:{paddingVertical:10,color:'#887969'},list:{flex:1},
 row:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#d8c7b5'},body:{fontSize:15,color:'#35291f'},sub:{fontSize:12,color:'#887969'},
 tabs:{display:'flex',flexDirection:'row',borderTopWidth:1,borderTopColor:'#d8c7b5',backgroundColor:'#f9f4eb'},
 tab:{flex:1,padding:18,alignItems:'center'},tabText:{fontSize:14,color:'#887969'},active:{color:'#82442f',fontWeight:'700'},
 button:{padding:13,backgroundColor:'#82442f',borderRadius:8,alignItems:'center',marginBottom:10},buttonLabel:{color:'#fff',fontSize:13}
})
