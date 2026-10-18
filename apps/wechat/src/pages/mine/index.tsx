import { useSyncCustomTabBar } from '../../utils/custom-tabbar'
import React, { useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { favoriteIds, getVenues, Venue } from '../../utils/venues'
import { refreshSites, syncState } from '../../services/sync'
import { AuthPanel } from '../../components/auth/AuthPanel'
import { authService } from '../../services/wechat-auth'
import { useAuthState } from '../../utils/use-auth-state'
import './index.css'

type Panel = 'home' | 'favorites' | 'recipes' | 'posts' | 'history' | 'settings'
type Entry = { id: string; title: string; body?: string; steps?: string }
type Visit = { key: string; kind: string; id: string; viewedAt?: string }
type Profile = { name: string; bio: string }
const PROFILE_KEY = 'jiuji.react.profile'
const HISTORY_KEY = 'jiuji-personal-v1:history'

function stored(key: string): unknown {
  try { return Taro.getStorageSync(key) } catch (_) { return null }
}
function rows(key: string): Entry[] {
  const result = stored(key)
  return Array.isArray(result) ? result.filter(item => item && typeof item === 'object') as Entry[] : []
}
function readProfile(): Profile {
  const saved = (stored(PROFILE_KEY) || stored('jiuji-personal-v1:profile') || {}) as Partial<Profile>
  return { name: typeof saved.name === 'string' && saved.name.trim() ? saved.name : '酒迹用户',
    bio: typeof saved.bio === 'string' ? saved.bio : '' }
}
function readVisits(): Visit[] {
  const result = stored(HISTORY_KEY)
  return Array.isArray(result) ? result.filter(row => row && row.kind === 'bar') as Visit[] : []
}
function ownEntries(kind: 'recipes' | 'posts'): Entry[] {
  const current = rows('jiuji.react.' + kind)
  const old = rows('jiuji-personal-v1:' + kind)
  const seen = new Set(current.map(item => String(item.id)))
  return [...current, ...old.filter(item => !seen.has(String(item.id)))]
}
export default function MinePage() {
  useSyncCustomTabBar(3)
  const authState = useAuthState(authService)
  const [panel, setPanel] = useState<Panel>('home')
  const [profile, setProfile] = useState<Profile>({ name: '酒迹用户', bio: '' })
  const [name, setName] = useState('酒迹用户')
  const [bio, setBio] = useState('')
  const [editing, setEditing] = useState(false)
  const [favorites, setFavorites] = useState<Venue[]>([])
  const [recipes, setRecipes] = useState<Entry[]>([])
  const [posts, setPosts] = useState<Entry[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [connection, setConnection] = useState('正在更新')
  const [refreshing, setRefreshing] = useState(false)
  const [pending, setPending] = useState(0)
  const [conflicts, setConflicts] = useState(0)

  function loadLocal() {
    const next = readProfile()
    setProfile(next); setName(next.name); setBio(next.bio)
    const ids = new Set(favoriteIds())
    setFavorites(getVenues().filter(bar => ids.has(String(bar.id))))
    setRecipes(ownEntries('recipes'))
    setPosts(ownEntries('posts'))
    setVisits(readVisits())
    const state = syncState()
    setPending(state.queued)
    setConflicts(state.conflicts)
  }
  async function update() {
    if (refreshing) return
    setRefreshing(true)
    const result = await refreshSites()
    loadLocal()
    const state = syncState()
    setConnection(result.ok ? '最近已更新' : '离线可用')
    setPending(state.queued)
    setConflicts(state.conflicts)
    setRefreshing(false)
  }
  useDidShow(() => {
    void authService.checkSession()
    loadLocal()
    void update()
  })
  function saveProfile() {
    const value = { name: name.trim() || '酒迹用户', bio: bio.trim() }
    try {
      Taro.setStorageSync(PROFILE_KEY, value)
      setProfile(value); setEditing(false)
      void Taro.showToast({ title: '资料已保存', icon: 'success' })
    } catch (_) { void Taro.showToast({ title: '保存失败', icon: 'none' }) }
  }
  async function clearVisits() {
    const result = await Taro.showModal({ title: '清除浏览记录', content: '只清除这台设备的浏览记录，收藏不会删除。' })
    if (!result.confirm) return
    try { Taro.setStorageSync(HISTORY_KEY, []); setVisits([]) }
    catch (_) { void Taro.showToast({ title: '操作失败', icon: 'none' }) }
  }
  const menu: { id: Panel; title: string; note: string }[] = [
    { id: 'favorites', title: '收藏', note: favorites.length + ' 家酒吧' },
    { id: 'recipes', title: '我的配方', note: recipes.length + ' 份' },
    { id: 'posts', title: '我的分享', note: posts.length + ' 篇' },
    { id: 'history', title: '浏览记录', note: visits.length + ' 条' }
  ]
  const listTitle: Record<Panel, string> = {
    home: '我的', favorites: '我的收藏', recipes: '我的配方',
    posts: '我的分享', history: '浏览记录', settings: '设置与隐私'
  }
  function openBar(id: number) {
    void Taro.navigateTo({ url: '/pages/venue/index?id=' + id })
  }
  return <ScrollView className='mine-screen' scrollY>
    <View className='mine-wrap'>
      <View className='mine-top'>
        <Text className='mine-heading'>{listTitle[panel]}</Text>
      </View>
      {panel !== 'home' ? <View className='mine-back' onClick={() => setPanel('home')}>
        <Text>‹ 返回我的</Text>
      </View> : null}
      {panel === 'home' ? <>
        <View className='mine-hero'>
          <View className='mine-avatar'><Text>酒</Text></View>
          <View className='mine-person'>
            <Text className='mine-name'>{profile.name}</Text>
            <Text className='mine-sub'>{profile.bio || '尚未填写个人简介'}</Text>
            <Text className='mine-guest'>{authState.status === 'authenticated' ? '已验证账户 · 本机资料未自动合并' : '本机资料 · 访客模式'}</Text>
          </View>
          <View className='mine-edit' onClick={() => setEditing(!editing)}>
            <Text>{editing ? '取消' : '编辑'}</Text>
          </View>
        </View>
        {editing ? <View className='mine-card mine-form'>
          <Text className='mine-card-title'>编辑个人资料</Text>
          <Input className='mine-field' value={name} maxlength={30} placeholder='昵称' onInput={e => setName(e.detail.value)} />
          <Input className='mine-field' value={bio} maxlength={100} placeholder='写一句个人简介' onInput={e => setBio(e.detail.value)} />
          <Button className='mine-main-button' onClick={saveProfile}>保存资料</Button>
        </View> : null}
        <AuthPanel service={authService} />
        <View className='mine-stat-grid'>
          <View className='mine-stat' onClick={() => setPanel('favorites')}><Text className='mine-stat-number'>{favorites.length}</Text><Text>收藏酒吧</Text></View>
          <View className='mine-stat' onClick={() => setPanel('recipes')}><Text className='mine-stat-number'>{recipes.length}</Text><Text>我的配方</Text></View>
          <View className='mine-stat' onClick={() => setPanel('posts')}><Text className='mine-stat-number'>{posts.length}</Text><Text>探店分享</Text></View>
        </View>
        <Text className='mine-section-label'>我的内容</Text>
        <View className='mine-card'>
          {([
            { title: '饮酒日记', note: '私人饮用时间轴', url: '/pages/journal-timeline/index' },
            { title: '酒吧足迹', note: '独立探店经历', url: '/pages/journal-footprints/index' },
            { title: '我的酒款', note: '按酒款归集', url: '/pages/journal-cocktails/index' }
          ] as const).map(item => <View className='mine-menu-row' key={item.url}
            onClick={() => void Taro.navigateTo({ url: item.url })}>
            <Text className='mine-menu-title'>{item.title}</Text>
            <Text className='mine-menu-note'>{item.note}　›</Text>
          </View>)}
          {menu.map(item => <View className='mine-menu-row' key={item.id} onClick={() => setPanel(item.id)}>
            <Text className='mine-menu-title'>{item.title}</Text>
            <Text className='mine-menu-note'>{item.note}　›</Text>
          </View>)}
        </View>
        <Text className='mine-section-label'>数据同步</Text>
        <View className='mine-card mine-sync'>
          <View className='mine-sync-head'>
            <View>
              <Text className='mine-card-title'>{connection}</Text>
              <Text className='mine-muted'>{pending ? '有 ' + pending + ' 条内容等待同步' : '公开内容自动更新，本机内容已保存'}</Text>
              {conflicts ? <Text className='mine-warning'>{conflicts} 条修改需要处理</Text> : null}
            </View>
            <View className='mine-refresh' onClick={() => void update()}>
              <Text>{refreshing ? '更新中' : '刷新'}</Text>
            </View>
          </View>
        </View>
        <View className='mine-card mine-settings-entry' onClick={() => setPanel('settings')}>
          <Text className='mine-menu-title'>设置与隐私</Text><Text className='mine-menu-note'>›</Text>
        </View>
      </> : null}
      {panel === 'favorites' ? <View className='mine-card'>
        {favorites.length ? favorites.map(bar => <View className='mine-menu-row' key={bar.id} onClick={() => openBar(bar.id)}>
          <View className='mine-row-content'><Text className='mine-menu-title'>{bar.name}</Text><Text className='mine-muted'>{bar.station}</Text></View>
          <Text className='mine-menu-note'>详情 ›</Text>
        </View>) : <Text className='mine-empty'>还没有收藏的酒吧，去地图中发现喜欢的地方吧。</Text>}
      </View> : null}
      {panel === 'recipes' || panel === 'posts' ? <View className='mine-card'>
        {(panel === 'recipes' ? recipes : posts).length ?
          (panel === 'recipes' ? recipes : posts).map(item => <View className='mine-menu-row' key={item.id}
            onClick={() => void Taro.switchTab({ url: panel === 'recipes' ? '/pages/mix/index' : '/pages/community/index' })}>
            <View className='mine-row-content'><Text className='mine-menu-title'>{item.title || '未命名'}</Text>
              <Text className='mine-muted'>{item.body || item.steps || '保存在本机'}</Text></View>
            <Text className='mine-menu-note'>查看 ›</Text>
          </View>) : <Text className='mine-empty'>还没有内容。前往{panel === 'recipes' ? '调酒' : '社区'}开始创作。</Text>}
      </View> : null}
      {panel === 'history' ? <View className='mine-card'>
        {visits.length ? visits.map((item, index) => {
          const bar = getVenues().find(entry => String(entry.id) === String(item.id))
          return <View className='mine-menu-row' key={item.key + '-' + index} onClick={() => openBar(Number(item.id))}>
            <Text className='mine-menu-title'>{bar?.name || '酒吧记录'}</Text><Text className='mine-menu-note'>查看 ›</Text>
          </View>
        }) : <Text className='mine-empty'>暂无浏览记录。</Text>}
        {visits.length ? <Button className='mine-plain-button' onClick={() => void clearVisits()}>清除本机浏览记录</Button> : null}
      </View> : null}
      {panel === 'settings' ? <View className='mine-card'>
        <AuthPanel service={authService} />
        <View className='mine-menu-row' onClick={() => void Taro.showModal({ title: '隐私说明', content: '公开酒吧和帖子通过网络读取。昵称、浏览记录等本机资料保存在当前设备；账号同步功能开放后会提供相应管理入口。', showCancel: false })}>
          <Text className='mine-menu-title'>隐私说明</Text><Text className='mine-menu-note'>›</Text>
        </View>
        <View className='mine-menu-row' onClick={() => void Taro.showModal({ title: '关于酒迹', content: '酒迹 Jiuji BarMap · 发现城市里的好酒与故事。', showCancel: false })}>
          <Text className='mine-menu-title'>关于酒迹</Text><Text className='mine-menu-note'>›</Text>
        </View>
        <View className='mine-menu-row' onClick={() => void clearVisits()}>
          <Text className='mine-menu-title'>清除浏览记录</Text><Text className='mine-menu-note'>›</Text>
        </View>
      </View> : null}
    </View>
  </ScrollView>
}
