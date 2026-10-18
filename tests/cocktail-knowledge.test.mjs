// PR-10 true core validation, isolated versions, legacy adapter and private repository.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createJournalRepository } from '../packages/core/src/journal.ts'
import { validateCocktailCatalog, variantsForCocktail,
  searchCocktails, legacyRecipePreview } from '../packages/core/src/cocktails.ts'
 import { readFileSync } from 'node:fs'

const raw=JSON.parse(fs.readFileSync('apps/wechat/src/data/cocktail-knowledge.json','utf8'))
const catalog=validateCocktailCatalog(raw)
const deep=x=>structuredClone(x)
const newVariant=(id, title, note='first')=>({
 ...deep(catalog.variants[0]), id, cocktailId:'margarita',title,
 status:'published',verification:'unverified',
 source:{name:'Internal unpublished test fixture',url:null,type:'legacy',verifiedAt:null},
 ingredients:[{name:'未核实的测试配料 '+note,quantity:null,unit:'unspecified',
    optional:false,originalText:'原始用量未注明 '+note}],
 steps:['测试步骤 '+note],
})
test('one cocktail has three independently addressable recipe variants, never overwritten',()=>{
 const fixture=deep(catalog)
 fixture.variants.push(newVariant('margarita-test-two','未核验 B','B'))
 fixture.variants.push(newVariant('margarita-test-three','未核验 C','C'))
 fixture.cocktails[0].recipeVariantIds.push('margarita-test-two','margarita-test-three')
 const checked=validateCocktailCatalog(fixture)
 const versions=variantsForCocktail(checked,'margarita')
 assert.deepEqual(versions.map(v=>v.id),[
  'margarita-iba-2026','margarita-test-two','margarita-test-three'])
 assert.equal(versions[0].ingredients[0].quantity,50)
 assert.equal(versions[1].ingredients[0].quantity,null)
 assert.notDeepEqual(versions[1].ingredients,versions[2].ingredients)
 versions[1].steps[0]='edited ONLY B'
 assert.notEqual(versions[2].steps[0],versions[1].steps[0])
 assert.equal(versions[0].steps[0],catalog.variants[0].steps[0])
})
test('Chinese, original and aliases are searchable with normalization and no duplicates',()=>{
 assert.deepEqual(searchCocktails(catalog,'玛格丽特').map(c=>c.id),['margarita'])
 assert.deepEqual(searchCocktails(catalog,'mARgaRita').map(c=>c.id),['margarita'])
 assert.deepEqual(searchCocktails(catalog,'玛格丽塔').map(c=>c.id),['margarita'])
 assert.deepEqual(searchCocktails(catalog,'内格罗尼').map(c=>c.id),['negroni'])
 assert.deepEqual(searchCocktails(catalog,'没有这款').map(c=>c.id),[])
})
test('orphan/duplicate/misowned version IDs are rejected, not silently reassigned',()=>{
 let fixture=deep(catalog);fixture.variants[0].cocktailId='negroni'
 assert.throws(()=>validateCocktailCatalog(fixture),/broken variant association/)
 fixture=deep(catalog);fixture.variants.push(deep(fixture.variants[0]))
 assert.throws(()=>validateCocktailCatalog(fixture),/duplicate version ID/)
 fixture=deep(catalog);fixture.cocktails[0].recipeVariantIds.push('orphan-id')
 assert.throws(()=>validateCocktailCatalog(fixture),/broken variant association/)
})
test('reject negative/zero/NaN quantities, unknown units and invented numeric conversions',()=>{
 const broken=[
  {quantity:-5},{quantity:0},{quantity:NaN},{quantity:Infinity},
  {unit:'litres'},{quantity:null,unit:'ml',originalText:'适量'},
  {quantity:null,unit:'unspecified',originalText:''},
 ]
 for(const patch of broken){
  const fixture=deep(catalog);Object.assign(fixture.variants[0].ingredients[0],patch)
  assert.throws(()=>validateCocktailCatalog(fixture),/invalid ingredient|unknown amount/)
 }
 const unknown=deep(catalog)
 unknown.variants[0].ingredients[0]={name:'原酒',quantity:null,unit:'unspecified',
  optional:false,originalText:'1/2杯（未经核验）'}
 validateCocktailCatalog(unknown)
 assert.equal(unknown.variants[0].ingredients[0].quantity,null)
})
test('missing source URL / verified date / primary evidence cannot claim verified',()=>{
 for(const patch of [{url:null},{verifiedAt:null},{type:'user'}]){
  const fixture=deep(catalog);Object.assign(fixture.variants[0].source,patch)
  assert.throws(()=>validateCocktailCatalog(fixture),/verified requires/)
 }
 const c=deep(catalog);c.cocktails[0].source.url=null
 assert.throws(()=>validateCocktailCatalog(c),/verified requires/)
 const candidate=deep(catalog);candidate.variants[0].verification='unverified'
 candidate.variants[0].source={name:'No verified source',url:null,type:'legacy',verifiedAt:null}
 assert.equal(validateCocktailCatalog(candidate).variants[0].verification,'unverified')
})
test('unknown historical raw ingredient strings remain verbatim; never guessed ml',()=>{
 const original={id:'old-private',title:'自制特调',
  ingredients:'金酒半杯；果汁适量；几滴苦精',steps:'摇到适合为止',metadata:{myNote:'私密'}}
 const normalized=legacyRecipePreview(original,'local')
 assert.equal(normalized.ingredients,original.ingredients)
 assert.equal(normalized.steps,original.steps)
 assert.equal(normalized.visibility,'private')
 assert.equal('quantity' in normalized,false)
 assert.equal(legacyRecipePreview({id:1,ingredients:'test'},'local'),null)
})
test('real PR03 repository stores separate drink instances, version references stay private',()=>{
 const storage=new Map(),repo=createJournalRepository({
  identity:()=>({kind:'verified',userId:'kb-user'}),
  storage:{read:key=>storage.get(key),write:(key,data)=>storage.set(key,structuredClone(data))},
  newId:(()=>{let n=0;return ()=>'knowledge-drink-'+(++n)})(),
  now:()=>new Date().toISOString()
 })
 const base={drinkLabel:'玛格丽特',consumedAt:'2026-10-18T10:00:00.000Z',
  contextKind:'home',cocktailId:'margarita',recipeVariantId:'margarita-iba-2026'}
 const a=repo.createDrink(base,'kb-mutation-a')
 const b=repo.createDrink(base,'kb-mutation-b')
 assert.notEqual(a.id,b.id)
 assert.equal(repo.listDrinks().length,2)
 assert.ok(repo.listDrinks().every(r=>r.visibility==='private'&&
  r.recipeVariantId==='margarita-iba-2026'))
 assert.equal(storage.size,1)
})
test('validator output is deterministic and flags legacy test fixtures as unverified',()=>{
 const stdout=execFileSync(process.execPath,['--experimental-strip-types',
  'scripts/validate-cocktail-import.mjs'],{encoding:'utf8'})
 const report=JSON.parse(stdout)
 assert.equal(report.cocktails,2)
 assert.equal(report.variants,2)
 assert.ok(report.sources.every(v=>v.status==='verified'&&v.sourceUrl.startsWith('https://iba-world.com/')))
 assert.deepEqual(report.legacyDevelopmentRecipes.map(v=>v.id),
  ['dev-recipe-001','dev-recipe-002'])
 assert.ok(report.legacyDevelopmentRecipes.every(v=>v.status==='unverified'))
})
