// SPDX-License-Identifier: MPL-2.0
// Public, read-only health & schema smoke test. Never sends a token or a mutation.
const assert=require('node:assert/strict')
const BASE=(process.env.SITES_API_BASE_URL || 'https://jiuji-test-console.equal-genet-1707.chatgpt.site').replace(/\/+$/,'')
async function getJson(path) {
  const response=await fetch(BASE+path,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{Accept:'application/json'}
  })
  assert.equal(response.status,200,path+' HTTP '+response.status+' (redirects are not valid)')
  const type=response.headers.get('content-type')||''
  assert.match(type,/application\/json/i,path+' must return JSON, not a login page')
  return response.json()
}
async function run() {
  const health=await getJson('/v1/health')
  assert.equal(health.ok,true)
  assert.equal(health.version,1)
  const snapshot=await getJson('/v1/sync')
  assert.ok(Number.isSafeInteger(snapshot.revision)&&snapshot.revision>=0,'invalid revision')
  const collections=snapshot.collections
  assert.ok(collections && typeof collections==='object','missing collections object')
  for(const kind of ['bars','recipes','posts','favorites'])
    assert.ok(Array.isArray(collections[kind]),'missing '+kind+' array')
  assert.ok(snapshot.versions && typeof snapshot.versions==='object','missing versions map')
  assert.equal(collections.favorites.length,0,'anonymous favorites exposed')
  assert.ok(collections.posts.every(p=>p.visibility==='public'),'private posts exposed')
  assert.ok(collections.recipes.every(r=>r.visibility==='public'),'private recipes exposed')
  assert.ok(!('testUsers' in snapshot)&&!('audit' in snapshot),'private admin data exposed')
  console.log(JSON.stringify({
    success:true,revision:snapshot.revision,
    bars:collections.bars.length,
    recipes:collections.recipes.length,
    posts:collections.posts.length,
    favorites:collections.favorites.length
  }))
}
run().catch(err=>{console.error('Sites API smoke failed:',err.message);process.exitCode=1})
