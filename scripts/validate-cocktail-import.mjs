#!/usr/bin/env node
// Validate a proposed knowledge dataset without ever editing old Sites recipes,
// the local draft store, or private journals. Output deterministic source report.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCocktailCatalog } from '../packages/core/src/cocktails.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const args=process.argv.slice(2)
const input=args.includes('--input')?args[args.indexOf('--input')+1]:
  path.join(root,'apps/wechat/src/data/cocktail-knowledge.json')
const reportFile=args.includes('--report')?args[args.indexOf('--report')+1]:null
if(!input || args.includes('--report')&&!reportFile)throw Error('Usage: --input dataset.json [--report source-report.json]')
const data=validateCocktailCatalog(JSON.parse(fs.readFileSync(input,'utf8')))
const legacy=JSON.parse(fs.readFileSync(path.join(root,'apps/wechat/src/data/sites-test.json'),'utf8'))
const report={
 schemaVersion:1,description:'Source metadata and structure verified; original sources must be checked by a human.',
 cocktails:data.cocktails.length,variants:data.variants.length,
 sources:data.variants.map(v=>({id:v.id,cocktailId:v.cocktailId,
  status:v.verification,sourceType:v.source.type,sourceUrl:v.source.url,
  checkedAt:v.source.verifiedAt,ingredientLines:v.ingredients.length,steps:v.steps.length})),
 legacyDevelopmentRecipes:(legacy.recipes||[]).map(r=>({id:r.id,title:r.title,status:'unverified',
  reason:'Sites development fixture; not imported as authoritative knowledge'}))
}
if(reportFile)fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
