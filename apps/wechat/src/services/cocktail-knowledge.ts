// SPDX-License-Identifier: MPL-2.0
// Published PR-10 verified seed is bundled, offline-readable and public.
// Not related to Sites v1 recipes or any per-account private notes.
import seed from '../data/cocktail-knowledge.json'
import { validateCocktailCatalog, variantsForCocktail } from '../../../../packages/core/src/cocktails'
import type { CocktailCatalog } from '../../../../packages/core/src/models'
import type { CocktailOption } from './journal-editor'

export const knowledgeCatalog: CocktailCatalog=validateCocktailCatalog(seed)
export const knowledgeOptions: CocktailOption[]=knowledgeCatalog.cocktails.map(c=>({
  id:c.id,label:c.nameZh+' / '+c.nameOriginal,
  variants:variantsForCocktail(knowledgeCatalog,c.id).map(v=>({id:v.id,label:v.title}))
}))
