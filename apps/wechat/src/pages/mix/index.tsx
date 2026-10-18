import React, { useState } from 'react'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useSyncCustomTabBar } from '../../utils/custom-tabbar'
import { publishedRows } from '../../services/sync'
import { knowledgeCatalog } from '../../services/cocktail-knowledge'
import { legacyRecipePreview } from '../../../../packages/core/src/cocktails'
import type { LegacyFlatRecipe } from '../../../../packages/core/src/cocktails'
import { CocktailKnowledgeView } from '../../components/cocktails/CocktailKnowledgeView'
import '../shared.css'

const KEY='jiuji.react.recipes' // NEVER delete or overwrite during knowledge-base upgrades.
export default function MixPage(){
  useSyncCustomTabBar(1)
  const [legacy,setLegacy]=useState<LegacyFlatRecipe[]>([])
  const [oldPublic,setOldPublic]=useState<LegacyFlatRecipe[]>([])
  const [status,setStatus]=useState('')
  const [offline,setOffline]=useState(false)
  const [title,setTitle]=useState('')
  const [ingredients,setIngredients]=useState('')
  const [steps,setSteps]=useState('')
  useDidShow(()=>{
    try{
      const original:TaroGeneral.IAnyObject|unknown=Taro.getStorageSync(KEY)
      if(original!==undefined && original!=='' && !Array.isArray(original)){
        setStatus('旧配方存储格式无法读取，原始内容仍保留，请勿覆盖。')
        setLegacy([])
      }else{
        setLegacy((Array.isArray(original)?original:[]).map(r=>legacyRecipePreview(r,'local'))
          .filter((r):r is LegacyFlatRecipe=>r!==null))
      }
    }catch{setStatus('读取旧配方失败，原始内容仍保留。')}
    // Legacy Sites flat recipes are read-only and NEVER promoted as verified.
    setOldPublic(publishedRows<LegacyFlatRecipe>('recipes')
      .map(r=>legacyRecipePreview(r,'sites-dev'))
      .filter((r):r is LegacyFlatRecipe=>r!==null))
    void Taro.getNetworkType().then(r=>setOffline(r.networkType==='none')).catch(()=>setOffline(false))
  })
  function saveLocalDraft(){
    if(!title.trim()||!ingredients.trim()||!steps.trim()){
      setStatus('请填写酒名、原始配料文字和步骤')
      return
    }
    // Preserve unknown raw fields, all historic drafts and their order.
    try {
      const previous:unknown=Taro.getStorageSync(KEY)
      if(previous!==''&&previous!==undefined&&!Array.isArray(previous))
        throw new Error('legacy format not writable')
      const draft={id:'local-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
        title:title.trim(),ingredients,steps,visibility:'private'}
      const next=[draft,...(Array.isArray(previous)?previous:[])]
      Taro.setStorageSync(KEY,next)
      // No Sites /v1/sync mutation, no knowledge-base publication.
      setLegacy(next.map(r=>legacyRecipePreview(r,'local')).filter((r):r is LegacyFlatRecipe=>r!==null))
      setTitle('');setIngredients('');setSteps('')
      setStatus('私人草稿仅保存在本机；未发布或同步')
    }catch{setStatus('本机存储失败，草稿尚未确认保存；输入仍保留')}
  }
  return <View>
    <CocktailKnowledgeView data={knowledgeCatalog} mode='catalog' offline={offline}
      onOpenCocktail={id=>void Taro.navigateTo({url:'/pages/cocktail-detail/index?id='+encodeURIComponent(id)})}/>
    <View className='kb-page'>
      <Text className='kb-section'>我的旧配方草稿 · 仅本机</Text>
      <Text className='kb-hint'>保留旧存储键，不会自动公开、关联或上传。无法解析的历史配料保持原始文字。</Text>
      <Input className='kb-search' value={title} placeholder='私人草稿：酒款名称'
        onInput={e=>setTitle(e.detail.value)}/>
      <Textarea className='kb-search' value={ingredients} placeholder='原始配料文字'
        onInput={e=>setIngredients(e.detail.value)}/>
      <Textarea className='kb-search' value={steps} placeholder='原始制作步骤'
        onInput={e=>setSteps(e.detail.value)}/>
      <Button className='kb-back' onClick={saveLocalDraft}>仅存本机草稿</Button>
      {status?<Text className='kb-warning'>{status}</Text>:null}
      {legacy.map(r=><View key={r.id} className='kb-row'>
        <Text className='kb-title'>{r.title}</Text>
        <Text className='kb-meta'>私人旧草稿 · 未核实 · 未公开</Text>
        <Text className='kb-meta'>{r.ingredients}</Text>
        <Text className='kb-meta'>{r.steps}</Text>
      </View>)}
      {oldPublic.length?<Text className='kb-section'>旧 Sites 配方（未核实，仅供参考）</Text>:null}
      {oldPublic.map(r=><View key={r.id} className='kb-row'>
        <Text className='kb-title'>{r.title}</Text>
        <Text className='kb-meta'>旧扁平资料 · 来源未核实 · 不属于官方知识库</Text>
        <Text className='kb-meta'>{r.ingredients}</Text>
        <Text className='kb-meta'>{r.steps}</Text>
      </View>)}
    </View>
  </View>
}
