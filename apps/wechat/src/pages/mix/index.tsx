import React, { useState } from 'react'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import '../shared.css'
import sitesData from '../../data/sites-test.json'
type Recipe = { id: string; title: string; ingredients: string; steps: string }
const KEY='jiuji.react.recipes'
const demoRecipes = sitesData.recipes as Recipe[]
export default function MixPage() {
 const [rows,setRows]=useState<Recipe[]>([])
 const [title,setTitle]=useState(''); const [ingredients,setIngredients]=useState(''); const [steps,setSteps]=useState('')
 useDidShow(()=>setRows(Taro.getStorageSync(KEY)||[]))
 const add=()=>{if(!title.trim()||!steps.trim())return Taro.showToast({title:'填写名称和步骤',icon:'none'})
 const next=[{id:String(Date.now()),title,ingredients,steps},...rows];Taro.setStorageSync(KEY,next);setRows(next);setTitle('');setIngredients('');setSteps('')}
 return <View className='page'><Text className='kicker'>JIUJI / RECIPES</Text><Text className='title'>调酒教程</Text>
 <Input className='field' placeholder='酒款名称' value={title} onInput={e=>setTitle(e.detail.value)}/>
 <Input className='field' placeholder='配料与用量' value={ingredients} onInput={e=>setIngredients(e.detail.value)}/>
 <Textarea className='field area' placeholder='调制步骤' value={steps} onInput={e=>setSteps(e.detail.value)}/>
 <Button onClick={add}>保存配方</Button>
 {[...rows, ...demoRecipes.filter(d => !rows.some(r => r.id === d.id))].map(r=><View className='row' key={r.id} onClick={()=>Taro.setClipboardData({data:r.title+'\n'+r.ingredients+'\n'+r.steps})}>
 <Text>{r.title}{r.id.startsWith('dev-') ? ' · 测试数据' : ''}</Text><Text className='muted'>复制配方 ↗</Text></View>)}</View>
}
