import React from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { CocktailKnowledgeView } from '../../components/cocktails/CocktailKnowledgeView'
import { knowledgeCatalog } from '../../services/cocktail-knowledge'
export default function RecipeVariantPage(){
  const router=useRouter(),id=typeof router.params.id==='string'?router.params.id:''
  return <CocktailKnowledgeView data={knowledgeCatalog} mode='variant' id={id}
    onBack={()=>void Taro.navigateBack()}/>
}
