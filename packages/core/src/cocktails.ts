// SPDX-License-Identifier: MPL-2.0
// PR-10 independent public knowledge-base and lossless read-only legacy adapter.
import type { Cocktail, CocktailCatalog, RecipeVariant, RecipeIngredient, RecipeSource } from './models.ts'

export class CocktailCatalogError extends Error {
  constructor(message: string) { super(message); this.name='CocktailCatalogError' }
}
const error=(label:string,message:string):never=>{throw new CocktailCatalogError(label+': '+message)}
const isObj=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v)
const validId=(v:unknown):v is string=>typeof v==='string' && /^[a-z0-9][a-z0-9-]{1,95}$/.test(v)
const nonEmpty=(v:unknown):v is string=>typeof v==='string' && v.trim().length>0
const validDate=(v:unknown):v is string => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
function source(raw:unknown,label:string):asserts raw is RecipeSource {
  if(!isObj(raw)||!nonEmpty(raw.name)||!['primary','secondary','legacy','user'].includes(String(raw.type)) ||
     !(raw.url===null || (typeof raw.url==='string' && /^https:\/\/[^/@\s]+(?:\/[^\s]*)?$/.test(raw.url))) ||
     !(raw.verifiedAt===null || validDate(raw.verifiedAt)))
    error(label,'invalid source')
}
function verified(raw:{verification:unknown;source:unknown},label:string):void {
  if(raw.verification!=='verified'&&raw.verification!=='unverified')
    error(label,'invalid verification status')
  if(raw.verification==='verified'){
    const s=raw.source as RecipeSource
    if(!s || s.type!=='primary' && s.type!=='secondary' ||
      !s.url || !s.verifiedAt)
      error(label,'verified requires traceable source URL and verification date')
  }
}
function ingredient(v:unknown,label:string):asserts v is RecipeIngredient {
  if(!isObj(v))error(label,'ingredient must be an object')
  const row=v as Record<string,unknown>
  if(!nonEmpty(row.name)||typeof row.optional!=='boolean'||
    !['ml','oz','dash','piece','tsp','unspecified'].includes(String(row.unit)))
    error(label,'invalid ingredient fields')
  if(row.quantity===null) {
    if(row.unit!=='unspecified' || !nonEmpty(row.originalText))error(label,'unknown amount must keep raw wording')
  } else if(typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||
    row.quantity<=0||row.quantity>10000||row.unit==='unspecified')
    error(label,'invalid ingredient amount/unit')
}
export function validateCocktailCatalog(value:unknown):CocktailCatalog {
  if(!isObj(value)||value.schemaVersion!==1||!Array.isArray(value.cocktails)||
    !Array.isArray(value.variants))error('catalog','schemaVersion 1, cocktails and variants required')
  const input=value as unknown as CocktailCatalog
  const cocktails=new Map<string,Cocktail>(),variants=new Map<string,RecipeVariant>()
  for(const c of input.cocktails) {
    if(!isObj(c)||!validId(c.id)||!nonEmpty(c.nameZh)||!nonEmpty(c.nameOriginal)||
      !Array.isArray(c.aliases)||!c.aliases.every(nonEmpty)||!Array.isArray(c.tags)||
      !c.tags.every(nonEmpty)||!Array.isArray(c.recipeVariantIds) ||
      !c.recipeVariantIds.every(validId) || new Set(c.recipeVariantIds).size!==c.recipeVariantIds.length)
      error('cocktail','invalid names, IDs or aliases')
    source(c.source,'cocktail '+c.id);verified(c,'cocktail '+c.id)
    if(cocktails.has(c.id))error(c.id,'duplicate cocktail ID')
    cocktails.set(c.id,c as Cocktail)
  }
  for(const v of input.variants) {
    if(!isObj(v)||!validId(v.id)||!validId(v.cocktailId)||!nonEmpty(v.title)||
      !nonEmpty(v.author)||!['published','draft'].includes(String(v.status))||
      !Array.isArray(v.ingredients)||v.ingredients.length===0||
      !Array.isArray(v.steps)||!v.steps.length||!v.steps.every(nonEmpty)||
      typeof v.createdAt!=='string'||Number.isNaN(Date.parse(v.createdAt))||
      typeof v.updatedAt!=='string'||Number.isNaN(Date.parse(v.updatedAt))||
      (v.yieldMl!==undefined && (typeof v.yieldMl!=='number'||!Number.isFinite(v.yieldMl)||v.yieldMl<=0)))
      error('variant','invalid ID, methods, dates or yield')
    source(v.source,'variant '+v.id);verified(v,'variant '+v.id)
    v.ingredients.forEach((i:unknown,n:number)=>ingredient(i,'variant '+v.id+' row '+(n+1)))
    if(!cocktails.has(v.cocktailId))error(v.id,'cocktailId not found')
    if(variants.has(v.id))error(v.id,'duplicate version ID')
    if(v.verification==='verified'&&v.status!=='published')error(v.id,'draft cannot be verified public recipe')
    variants.set(v.id,v as RecipeVariant)
  }
  for(const c of cocktails.values()) {
    for(const id of c.recipeVariantIds){
      const v=variants.get(id)
      if(!v || v.cocktailId!==c.id)error(c.id,'broken variant association: '+id)
    }
  }
  for(const v of variants.values())
    if(!cocktails.get(v.cocktailId)!.recipeVariantIds.includes(v.id))
      error(v.id,'variant omitted from cocktail version list')
  return input
}
export function publishedCocktails(data:CocktailCatalog):Cocktail[] {
  return data.cocktails.filter(c=>c.recipeVariantIds.some(id=>data.variants.some(v=>v.id===id&&v.status==='published')))
}
export function variantsForCocktail(data:CocktailCatalog,id:string):RecipeVariant[] {
  const c=data.cocktails.find(x=>x.id===id)
  if(!c)return []
  return c.recipeVariantIds.flatMap(key=>{
    const v=data.variants.find(x=>x.id===key)
    return v&&v.status==='published'?[v]:[]
  })
}
export function searchCocktails(data:CocktailCatalog,term:string):Cocktail[] {
  const needle=term.normalize('NFKC').trim().toLocaleLowerCase()
  return publishedCocktails(data).filter(c=>!needle ||
    [c.nameZh,c.nameOriginal,...c.aliases].some(t=>t.normalize('NFKC').toLocaleLowerCase().includes(needle)))
}
export type LegacyFlatRecipe = {id:string;title:string;ingredients:string;steps:string;visibility?:string}
export function legacyRecipePreview(raw:unknown,origin:'local'|'sites-dev'):LegacyFlatRecipe|null {
  if(!isObj(raw)||!nonEmpty(raw.id)||!nonEmpty(raw.title)||
    !nonEmpty(raw.ingredients)||!nonEmpty(raw.steps))return null
  // Legacy ingredient strings must remain untouched; never parse estimated ml.
  return {id:raw.id,title:raw.title,ingredients:raw.ingredients,
    steps:raw.steps,visibility:origin==='local'?'private':'unverified-dev'}
}
