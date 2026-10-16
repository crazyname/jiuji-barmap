import React, { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type MineBar = { id: number; name: string; station: string }
export type MineContent = { id: string; title: string; visibility?: string }
type Panel = 'home' | 'favorites' | 'recipes' | 'posts' | 'settings'
type Profile = { name: string; bio: string }
type Props = {
  bars: MineBar[]
  recipes: MineContent[]
  posts: MineContent[]
  favorites: string[]
  synced: boolean
  pending: number
  refreshing: boolean
  onRefresh: () => void
  onOpenTab: (tab: 'map' | 'mix' | 'community') => void
  onOpenBar: (bar: MineBar) => void
}
const PROFILE_KEY = 'jiuji.mobile.profile.v1'

export default function MineScreen(props: Props) {
  const [panel, setPanel] = useState<Panel>('home')
  const [profile, setProfile] = useState<Profile>({ name: '酒迹用户', bio: '' })
  const [draftName, setDraftName] = useState('酒迹用户')
  const [draftBio, setDraftBio] = useState('')
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    let active = true
    void AsyncStorage.getItem(PROFILE_KEY).then(value => {
      if (!active || !value) return
      try {
        const saved = JSON.parse(value) as Partial<Profile>
        const next = { name: typeof saved.name === 'string' && saved.name ? saved.name : '酒迹用户',
          bio: typeof saved.bio === 'string' ? saved.bio : '' }
        setProfile(next); setDraftName(next.name); setDraftBio(next.bio)
      } catch (_) { /* ignore malformed local preference */ }
    })
    return () => { active = false }
  }, [])
  async function saveProfile() {
    const next = { name: draftName.trim() || '酒迹用户', bio: draftBio.trim() }
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next))
      setProfile(next); setEditing(false)
    } catch (_) { Alert.alert('保存失败', '请稍后再试。') }
  }
  const ownRecipes = props.recipes.filter(item => item.visibility !== 'public')
  const ownPosts = props.posts.filter(item => item.visibility !== 'public')
  const bars = props.bars.filter(item => props.favorites.includes(String(item.id)))
  const sections: { id: Panel; label: string; count: number }[] = [
    { id: 'favorites', label: '我的收藏', count: bars.length },
    { id: 'recipes', label: '我的配方', count: ownRecipes.length },
    { id: 'posts', label: '我的分享', count: ownPosts.length }
  ]
  const titles: Record<Panel,string> = {
    home: '我的', favorites: '我的收藏', recipes: '我的配方',
    posts: '我的分享', settings: '设置与隐私'
  }
  function row(label: string, note: string, action: () => void, key: string) {
    return <TouchableOpacity key={key} style={s.row} onPress={action}>
      <Text style={s.rowTitle}>{label}</Text><Text style={s.rowNote}>{note} ›</Text>
    </TouchableOpacity>
  }
  return <ScrollView style={s.root} contentContainerStyle={s.container} keyboardShouldPersistTaps='handled'>
    <Text style={s.overline}>JIUJI / ACCOUNT</Text>
    <Text style={s.heading}>{titles[panel]}</Text>
    {panel !== 'home' ? <TouchableOpacity onPress={() => setPanel('home')} style={s.back}>
      <Text style={s.actionText}>‹ 返回我的</Text>
    </TouchableOpacity> : null}
    {panel === 'home' ? <>
      <View style={s.hero}>
        <View style={s.avatar}><Text style={s.avatarText}>酒</Text></View>
        <View style={s.person}>
          <Text style={s.personName}>{profile.name}</Text>
          <Text style={s.personBio} numberOfLines={1}>{profile.bio || '收集城市的夜晚与好酒'}</Text>
          <Text style={s.guest}>本机资料 · 访客模式</Text>
        </View>
        <TouchableOpacity style={s.smallButton} onPress={() => setEditing(!editing)}>
          <Text style={s.actionText}>{editing ? '取消' : '编辑'}</Text>
        </TouchableOpacity>
      </View>
      {editing ? <View style={s.cardPadding}>
        <Text style={s.cardTitle}>编辑个人资料</Text>
        <TextInput style={s.input} value={draftName} maxLength={30} onChangeText={setDraftName} placeholder='昵称'/>
        <TextInput style={s.input} value={draftBio} maxLength={100} onChangeText={setDraftBio} placeholder='个人简介'/>
        <TouchableOpacity style={s.primary} onPress={() => void saveProfile()}><Text style={s.primaryText}>保存资料</Text></TouchableOpacity>
      </View> : null}
      <View style={s.stats}>
        {sections.map(item => <TouchableOpacity key={item.id} style={s.stat} onPress={() => setPanel(item.id)}>
          <Text style={s.statValue}>{item.count}</Text>
          <Text style={s.statLabel}>{item.label}</Text>
        </TouchableOpacity>)}
      </View>
      <Text style={s.section}>我的内容</Text>
      <View style={s.card}>{sections.map(item => row(item.label, String(item.count) + ' 条', () => setPanel(item.id), item.id))}</View>
      <Text style={s.section}>数据同步</Text>
      <View style={s.cardPadding}>
        <View style={s.syncRow}>
          <View style={s.person}><Text style={s.cardTitle}>{props.synced ? '最近已更新' : '离线可用'}</Text>
            <Text style={s.sub}>{props.pending ? props.pending + ' 条内容待同步' : '公开内容自动更新，本机内容已保存'}</Text>
          </View>
          <TouchableOpacity style={s.smallButton} onPress={props.onRefresh}>
            <Text style={s.actionText}>{props.refreshing ? '更新中' : '刷新'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[s.card,s.bottom]}>{row('设置与隐私', '', () => setPanel('settings'), 'settings')}</View>
    </> : null}
    {panel === 'favorites' ? <View style={s.card}>
      {bars.length ? bars.map(bar => row(bar.name, bar.station, () => props.onOpenBar(bar),String(bar.id)))
      : <Text style={s.empty}>还没有收藏，去地图上发现喜欢的地方吧。</Text>}
    </View> : null}
    {panel === 'recipes' || panel === 'posts' ? <View style={s.card}>
      {(panel === 'recipes' ? ownRecipes : ownPosts).length ?
        (panel === 'recipes' ? ownRecipes : ownPosts).map(item => row(item.title || '未命名', '查看',
          () => props.onOpenTab(panel === 'recipes' ? 'mix' : 'community'), item.id))
        : <Text style={s.empty}>这里还没有内容，去{panel === 'recipes' ? '调酒' : '社区'}开始创作吧。</Text>}
    </View> : null}
    {panel === 'settings' ? <View style={s.card}>
      {row('登录 / 注册', '即将开放', () => Alert.alert('账号登录', '账号功能即将开放。'), 'account')}
      {row('隐私说明', '', () => Alert.alert('隐私说明',
        '公开内容通过网络读取，昵称等本机资料保存在当前设备。账号同步功能上线后会提供相应管理入口。'), 'privacy')}
      {row('关于酒迹', '', () => Alert.alert('关于酒迹', '酒迹 Jiuji BarMap · 发现城市里的好酒与故事。'), 'about')}
    </View> : null}
  </ScrollView>
}
const colors = { paper:'#f4eddf', card:'#f9f4eb', stroke:'#d8c7b5', ink:'#35291f', accent:'#82442f', muted:'#887969' }
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:colors.paper},
 container:{paddingHorizontal:17,paddingTop:20,paddingBottom:56},
 overline:{fontSize:10,color:colors.accent,letterSpacing:2},
 heading:{fontSize:27,fontWeight:'700',color:colors.ink,marginTop:8,marginBottom:17},
 back:{marginBottom:13,paddingVertical:5},
 actionText:{color:colors.accent,fontSize:13,fontWeight:'500'},
 hero:{borderWidth:1,borderColor:colors.stroke,backgroundColor:colors.card,borderRadius:12,padding:14,flexDirection:'row',alignItems:'center',gap:11},
 avatar:{height:54,width:54,borderRadius:27,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'},
 avatarText:{color:'white',fontSize:25,fontWeight:'700'},
 person:{flex:1,minWidth:0},
 personName:{color:colors.ink,fontSize:20,fontWeight:'700'},
 personBio:{color:colors.muted,fontSize:12,marginTop:5},
 guest:{color:colors.muted,fontSize:10,marginTop:8},
 smallButton:{paddingVertical:9,paddingHorizontal:12,borderColor:colors.stroke,borderWidth:1,borderRadius:7,alignItems:'center'},
 stats:{flexDirection:'row',gap:8,marginVertical:15},
 stat:{flex:1,alignItems:'center',backgroundColor:colors.card,borderWidth:1,borderColor:colors.stroke,borderRadius:10,paddingVertical:13},
 statValue:{fontSize:23,fontWeight:'700',color:colors.accent},
 statLabel:{fontSize:11,color:colors.muted,marginTop:6},
 section:{fontSize:12,fontWeight:'700',letterSpacing:1.5,color:colors.accent,marginTop:13,marginBottom:8},
 card:{backgroundColor:colors.card,borderRadius:10,borderWidth:1,borderColor:colors.stroke,paddingHorizontal:14,overflow:'hidden'},
 row:{minHeight:51,borderBottomWidth:1,borderBottomColor:'#e6d9c8',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
 rowTitle:{color:colors.ink,fontSize:15,flexShrink:1},
 rowNote:{color:colors.muted,fontSize:12},
 empty:{padding:25,textAlign:'center',color:colors.muted,fontSize:13,lineHeight:20},
 cardPadding:{backgroundColor:colors.card,borderRadius:10,borderWidth:1,borderColor:colors.stroke,padding:15,marginTop:8},
 cardTitle:{fontSize:15,color:colors.ink,fontWeight:'700'},
 sub:{fontSize:12,color:colors.muted,marginTop:8,lineHeight:19},
 syncRow:{flexDirection:'row',alignItems:'center',gap:10},
 bottom:{marginTop:16},
 input:{backgroundColor:'#f1e9dc',borderRadius:7,marginTop:10,padding:10,color:colors.ink,fontSize:14},
 primary:{backgroundColor:colors.accent,alignItems:'center',padding:12,borderRadius:7,marginTop:12},
 primaryText:{color:'#fff',fontSize:14,fontWeight:'600'}
})
