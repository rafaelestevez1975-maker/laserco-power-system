import { readFileSync } from 'fs'
const [APP,cookie]=readFileSync('/tmp/app_cookie.txt','utf8').split('\n')
const routes=readFileSync('/tmp/menu_routes.txt','utf8').split('\n').filter(Boolean)
const bad=[], ok=[], red=[]
for(const path of routes){
  try{
    const r=await fetch(`${APP}${path}`,{headers:{Cookie:cookie},redirect:'manual'})
    if(r.status===200) ok.push(path)
    else if(r.status>=300&&r.status<400) red.push(`${path} -> ${r.status} ${r.headers.get('location')}`)
    else bad.push(`${path} -> ${r.status}`)
  }catch(e){ bad.push(`${path} -> EXC ${e.message}`) }
}
console.log(`TOTAL ${routes.length} | 200 OK: ${ok.length} | redirect: ${red.length} | ERRO(>=400): ${bad.length}`)
if(bad.length){console.log('\n=== ROTAS COM ERRO (não abrem) ==='); bad.forEach(b=>console.log('  ✗',b))}
if(red.length){console.log('\n=== REDIRECTS ==='); red.forEach(b=>console.log('  ↪',b))}
