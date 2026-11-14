import assert from 'node:assert/strict'
import test from 'node:test'
import { registerApiRoutes } from '../src/routes/apiRoutes.js'
function routes(client) {
  const registered=new Map()
  const app=Object.fromEntries(['get','post','patch','delete'].map(method=>[method,(path,...handlers)=>registered.set(`${method} ${path}`,handlers)]))
  const authRequired=()=>{}
  registerApiRoutes(app,{authRequired,sendError:(res,error)=>res.status(500).json({message:error.message})})
  const req={supabase:client,user:{id:'self'},params:{id:'voca-id'},body:{}}
  const res={statusCode:200,status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(){return this}}
  return {req,res,run:async key=>{
    const handlers=registered.get(key)
    assert.ok(handlers.includes(authRequired),'account route must remain authenticated')
    await handlers.at(-1)(req,res)
  }}
}
test('account reads the common profile RPC, with no legacy fallback table writes',async()=>{
 const app=routes({rpc:async(name)=>{assert.equal(name,'account_profile');return{data:{id:'self',username:'Name',email:'self@example.test'},error:null}}})
 await app.run('get /api/auth/me')
 assert.equal(app.res.body.username,'Name')
})
test('account updates only display fields and does not accept ID, role or email writes',async()=>{
 const app=routes({rpc:async(name,args)=>{assert.equal(name,'update_account_profile');assert.deepEqual(args,{p_username:'New',p_profile_image:null});return{data:{username:'New'},error:null}}})
 app.req.body={username:' New ',id:'other',email:'other@example.test',role:'admin'}
 await app.run('patch /api/auth/me')
 assert.equal(app.res.body.username,'New')
})
test('collaborator list uses the permission-checked common identity projection',async()=>{
 const app=routes({rpc:async(name,args)=>{assert.equal(name,'collaborator_profiles');assert.deepEqual(args,{p_voca_id:'voca-id'});return{data:[],error:null}}})
 await app.run('get /api/vocas/:id/collaborators')
 assert.deepEqual(app.res.body,[])
})
test('profile RPC failures are surfaced instead of silently recreating public.profiles',async()=>{
 const app=routes({rpc:async()=>({data:null,error:{message:'unavailable'}})})
 await app.run('get /api/auth/me')
 assert.equal(app.res.statusCode,500)
})
