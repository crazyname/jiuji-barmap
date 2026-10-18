// SPDX-License-Identifier: MPL-2.0
import React, { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import type { CocktailCatalog, RecipeVariant } from '../../../../../packages/core/src/models'
import { searchCocktails, variantsForCocktail } from '../../../../../packages/core/src/cocktails'
import './cocktail-knowledge.css'

export interface KnowledgeViewProps {
  data: CocktailCatalog
  mode: 'catalog'|'cocktail'|'variant'
  id?: string
  offline?: boolean
  onOpenCocktail?: (id:string)=>void
  onOpenVariant?: (id:string)=>void
  onBack?: ()=>void
}
export function ingredientLabel(row:RecipeVariant['ingredients'][number]):string {
  return row.quantity===null
    ?row.originalText||row.name
    :row.name+' · '+row.quantity+' '+row.unit+(row.optional?'（可选）':'')
}
export function CocktailKnowledgeView({data,mode,id,offline=false,
  onOpenCocktail,onOpenVariant,onBack}:KnowledgeViewProps) {
  const [query,setQuery]=useState('')
  const cocktails=searchCocktails(data,query)
  const cocktail=data.cocktails.find(c=>c.id===id)
  const variant=data.variants.find(v=>v.id===id&&v.status==='published')
  const source=(status:'verified'|'unverified')=>status==='verified'?'来源已逐项核对':'未核实，不代表官方配方'
  return <View className='kb-page'>
    <View className='kb-heading'><Text>鸡尾酒知识库</Text></View>
    {offline?<Text className='kb-warning'>当前离线：可查看内置资料，暂不能获取更新。</Text>:null}
    {mode==='catalog'?<>
      <Text className='kb-subtitle'>按酒款浏览 · 同一酒款可保存多个独立来源版本</Text>
      <Input className='kb-search' value={query} placeholder='搜索中文名、原文名或别名'
        onInput={e=>setQuery(e.detail.value)} />
      {!cocktails.length?<Text className='kb-empty'>没有匹配的酒款。可使用私人日记自由填写酒名。</Text>:null}
      {cocktails.map(c=><View key={c.id} className='kb-row'
        onClick={()=>onOpenCocktail?.(c.id)}>
        <Text className='kb-title'>{c.nameZh}</Text>
        <Text className='kb-subtitle'>{c.nameOriginal}</Text>
        <Text className='kb-meta'>{variantsForCocktail(data,c.id).length} 个来源版本 · {source(c.verification)}</Text>
        {c.tags.length?<Text className='kb-meta'>{c.tags.join(' · ')}</Text>:null}
      </View>)}
      <Text className='kb-hint'>仅收录可溯源数据；旧测试酒谱与私人草稿单独显示，不算官方知识库。</Text>
    </>:mode==='cocktail'?<>
      <Button className='kb-back' onClick={onBack}>返回调酒目录</Button>
      {!cocktail?<Text className='kb-empty'>未找到酒款：本机资料尚未包含该条目。</Text>:<>
        <Text className='kb-title'>{cocktail.nameZh}</Text>
        <Text className='kb-subtitle'>{cocktail.nameOriginal}</Text>
        {cocktail.aliases.length?<Text className='kb-meta'>别名：{cocktail.aliases.join('、')}</Text>:null}
        {cocktail.description?<Text>{cocktail.description}</Text>:null}
        <Text className='kb-status'>{source(cocktail.verification)}</Text>
        <Text className='kb-section'>配方版本（互不覆盖）</Text>
        {variantsForCocktail(data,cocktail.id).map(v=><View className='kb-row' key={v.id}
          onClick={()=>onOpenVariant?.(v.id)}>
          <Text className='kb-title'>{v.title}</Text>
          <Text className='kb-meta'>{v.author} · {source(v.verification)}</Text>
        </View>)}
      </>}
    </>:<>
      <Button className='kb-back' onClick={onBack}>返回酒款</Button>
      {!variant?<Text className='kb-empty'>找不到这个配方版本，未推断或替换为其他版本。</Text>:<>
        <Text className='kb-title'>{variant.title}</Text>
        <Text className='kb-subtitle'>{data.cocktails.find(c=>c.id===variant.cocktailId)?.nameZh||''}</Text>
        <Text className='kb-status'>{source(variant.verification)}</Text>
        <Text className='kb-meta'>来源机构／作者：{variant.author}</Text>
        <Text className='kb-meta'>来源类型：{variant.source.type==='primary'?'原始来源':'其他注明的来源'}</Text>
        <Text className='kb-meta'>核对日期：{variant.source.verifiedAt||'未核对'}</Text>
        <Text className='kb-source' selectable>{variant.source.url||'来源链接未提供'}</Text>
        <Text className='kb-section'>配料与用量</Text>
        {variant.ingredients.map((line,i)=><Text key={i} className='kb-ingredient'>
          {ingredientLabel(line)}
        </Text>)}
        <Text className='kb-section'>制作方法</Text>
        {variant.steps.map((step,i)=><Text key={i} className='kb-step'>{i+1}. {step}</Text>)}
        {variant.glass?<Text className='kb-meta'>杯型：{variant.glass}</Text>:null}
        {variant.technique?<Text className='kb-meta'>技法：{variant.technique}</Text>:null}
        {variant.garnish?<Text className='kb-meta'>装饰：{variant.garnish}</Text>:null}
      </>}
    </>}
  </View>
}
