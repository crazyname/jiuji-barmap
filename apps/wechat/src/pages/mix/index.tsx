import React, { useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useSyncCustomTabBar } from '../../utils/custom-tabbar'
import { publishedRows } from '../../services/sync'
import { knowledgeCatalog } from '../../services/cocktail-knowledge'
import { legacyRecipePreview } from '../../../../../packages/core/src/cocktails'
import type { LegacyFlatRecipe } from '../../../../../packages/core/src/cocktails'
import demoSites from '../../data/sites-test.json'
import { CocktailKnowledgeView } from '../../components/cocktails/CocktailKnowledgeView'
import { authService } from '../../services/wechat-auth'
import { useAuthState } from '../../utils/use-auth-state'
import '../shared.css'

const KEY='jiuji.react.recipes' // Never deleted, reassigned or auto-migrated.
export default function MixPage(){
  useSyncCustomTabBar(1)
  const auth=useAuthState(authService)
  const [legacy,setLegacy]=useState<LegacyFlatRecipe[]>([])
  const [legacyShown,setLegacyShown]=useState(false)
  const [oldPublic,setOldPublic]=useState<LegacyFlatRecipe[]>([])
  const [status,setStatus]=useState('')
  const [offline,setOffline]=useState(false)
  const demoRecipes=(demoSites.recipes||[]).map(r=>legacyRecipePreview(r,'sites-dev'))
    .filter((r):r is LegacyFlatRecipe=>r!==null)
  useEffect(()=>{
    if(auth.status!=='authenticated'){
      // Never read a private legacy device key while unauthenticated.
      setLegacyShown(false)
      setLegacy([])
      setStatus('')
    }
  },[auth.status,auth.account?.id,auth.epoch])
  useDidShow(()=>{
    // This is public Sites v1 read-only compatibility, not a recipe uploader.
    setOldPublic(publishedRows<LegacyFlatRecipe>('recipes')
      .filter(r=>r.visibility===undefined||r.visibility==='public')
      .map(r=>legacyRecipePreview(r,'sites-dev'))
      .filter((r):r is LegacyFlatRecipe=>r!==null))
    void Taro.getNetworkType().then(r=>setOffline(r.networkType==='none')).catch(()=>setOffline(false))
  })
  async function showLegacy(){
    const before=authService.verifiedIdentity()?.userId
    if(!before){setStatus('需要经服务器验证的账号后才能查看本机私人草稿');return}
    const answer=await Taro.showModal({
      title:'查看这台设备的历史草稿',
      content:'这些旧草稿没有账号归属信息。仅在此设备显示，不会绑定当前账号或上传；同设备其他用户可能曾使用此功能。确定查看吗？'
    })
    if(!answer.confirm || authService.verifiedIdentity()?.userId!==before)return
    try{
      const original:unknown=Taro.getStorageSync(KEY)
      if(original!==undefined&&original!==''&&!Array.isArray(original)){
        setStatus('旧存储格式不兼容：原始数据仍保留，没有尝试转换')
        return
      }
      const entries=(Array.isArray(original)?original:[]).map(r=>legacyRecipePreview(r,'local'))
        .filter((r):r is LegacyFlatRecipe=>r!==null)
      // Unknown legacy rows remain untouched in storage even if not displayable.
      setLegacy(entries)
      setLegacyShown(true)
      setStatus('仅查看原始本机草稿；未同步、未公开、未归属任何账号')
    }catch{setStatus('读取旧草稿失败，原始数据仍保留，没有进行写入')}
  }
  return <View>
    <CocktailKnowledgeView data={knowledgeCatalog} mode='catalog' offline={offline}
      onOpenCocktail={id=>void Taro.navigateTo({
        url:'/pages/cocktail-detail/index?id='+encodeURIComponent(id)
      })}/>
    <View className='kb-page'>
      <Text className='kb-section'>本机历史私人配方</Text>
      {auth.status==='authenticated'?<>
        <Text className='kb-hint'>旧数据未绑定任何账号，必须主动确认查看；不会自动公开、同步或转换原始字符串。</Text>
        {!legacyShown?<Button className='kb-back' onClick={()=>void showLegacy()}>确认查看本机历史草稿</Button>:null}
        {status?<Text className='kb-warning'>{status}</Text>:null}
        {legacyShown && !legacy.length?<Text className='kb-hint'>没有可直接显示的旧草稿；原始存储未被修改。</Text>:null}
        {legacyShown?legacy.map(r=><View key={r.id} className='kb-row'>
          <Text className='kb-title'>{r.title}</Text>
          <Text className='kb-meta'>仅本机旧草稿 · 未核实 · 未公开</Text>
          <Text className='kb-meta'>{r.ingredients}</Text>
          <Text className='kb-meta'>{r.steps}</Text>
        </View>):null}
      </>:<Text className='kb-hint'>游客可浏览公共知识库。历史私人草稿不会自动读取；正式账号验证后可主动确认查看。</Text>}
      {demoRecipes.length||oldPublic.length
        ?<Text className='kb-section'>旧 Sites／演示配方（未核实，仅供参考）</Text>:null}
      {[...oldPublic,...demoRecipes.filter(r=>!oldPublic.some(old=>old.id===r.id))].map(r=><View key={r.id} className='kb-row'>
        <Text className='kb-title'>{r.title}</Text>
        <Text className='kb-meta'>旧扁平资料 · 来源未核实 · 不属于官方知识库</Text>
        <Text className='kb-meta'>{r.ingredients}</Text>
        <Text className='kb-meta'>{r.steps}</Text>
      </View>)}
    </View>
  </View>
}
