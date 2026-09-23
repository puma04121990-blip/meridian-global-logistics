const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function game(saved){
 const nodes=new Map(),storage=new Map(saved?[['meridian-save-v1',JSON.stringify(saved)]]:[]);
 const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',checked:true,innerHTML:'',style:{},classList:{remove(){}},insertAdjacentHTML(){},querySelector:node,showModal(){},close(){}});return nodes.get(s)};
 const c=vm.createContext({document:{querySelector:node},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>0,clearTimeout(){}});
 for(const file of ['game.js','economy.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),c);
 return {run:s=>vm.runInContext(s,c),node,storage};
}
test('old saves migrate without changing money, vehicles or day',()=>{
 const a=game();const old=a.run('state.day=12;state.cash=12345;JSON.parse(JSON.stringify(state))');delete old.economy;
 const b=game(old);assert.equal(b.run('state.day'),12);assert.equal(b.run('state.cash'),12345);assert.equal(b.run('state.fleet.length'),2);assert.equal(b.run('econInit().plants.length'),0);
 for(const tab of ['overview','contracts','fleet','network','research','finance','market'])b.run(`openTab('${tab}')`);
 assert.ok(b.node('#app').innerHTML.includes('Производственные цепочки'));
});
test('buy and immediate resale cannot generate money through price impact',()=>{
 for(const qty of [5,100]){const g=game();g.run(`state.cash=1e6;purchaseStock(0,1,${qty});sellStock(0,1,${qty})`);assert.ok(g.run('state.cash')<1e6);assert.equal(g.run('stock(0,1).qty'),0);assert.ok(g.run('econInit().profit')<0);}
});
test('warehouse, money, license and invalid amounts prevent purchases',()=>{
 const g=game();g.run('purchaseStock(0,0,5);purchaseStock(0,1,-5)');assert.equal(g.run('stockWeight(0)'),0);
 g.run('state.cash=1e6;purchaseStock(0,1,100);purchaseStock(0,1,100);purchaseStock(0,1,5)');assert.equal(g.run('stockWeight(0)'),200);
 const cash=g.run('state.cash');g.run('purchaseStock(0,2,5)');assert.equal(g.run('state.cash'),cash);
 g.run('state.cash=1;purchaseStock(0,3,5)');assert.equal(g.run('stock(0,3).qty'),0);
});
test('production consumes raw goods once and capitalizes labor, but charges upkeep separately',()=>{
 const g=game();g.run('state.cash=1e6;purchaseStock(0,1,10);buildPlant(0,0);togglePlant(1)');
 const avg=g.run('stock(0,1).basis/10'),cash=g.run('state.cash'),fixed=g.run('fixed()');g.run('nextDay()');
 assert.ok(Math.abs(g.run('stock(0,1).qty')-4.4)<1e-8);assert.equal(g.run('stock(0,2).qty'),4);
 assert.ok(Math.abs(g.run('stock(0,2).basis')-(avg*5.6+850))<1e-8);
 assert.ok(Math.abs(g.run('state.cash')-(cash-fixed-850-8.4*2))<1e-8);
 g.run('nextDay()');assert.equal(g.run('stock(0,2).qty'),4);assert.equal(g.run('econInit().plants[0].status'),'Нет сырья');
});
test('own cargo reserves destination, arrives once and produces no contract payout',()=>{
 const g=game();g.run('state.cash=1e6;state.regions.push(1);state.hubs[1]=1;state.fleet.push({id:99,type:4,condition:100,location:0});purchaseStock(0,3,10)');
 g.node('#trade-d').value='1';g.node('#trade-v').value='99';g.node('#trade-qty').value='10';
 g.run('sendTrade(0,3)');assert.equal(g.run('stock(0,3).qty'),0);assert.equal(g.run('incoming(1)'),10);assert.equal(g.run('load(1)'),10);
 const total=g.run('state.jobs[0].total'),basis=g.run('state.jobs[0].trade.basis');
 for(let i=0;i<total;i++)g.run('nextDay()');
 assert.equal(g.run('state.jobs.length'),0);assert.equal(g.run('stock(1,3).qty'),10);assert.equal(g.run('stock(1,3).basis'),basis);assert.equal(g.run('state.revenue'),0);assert.equal(g.run('state.fleet.find(v=>v.id===99).location'),1);
 g.run('nextDay()');assert.equal(g.run('stock(1,3).qty'),10);
 const restored=game(JSON.parse(g.storage.get('meridian-save-v1')));assert.equal(restored.run('stock(1,3).qty'),10);
});
test('food spoilage reduces quantity and cost basis, reset clears new economy',()=>{
 const g=game();g.run("state.tech.push('cold');purchaseStock(0,0,5)");const basis=g.run('stock(0,0).basis');g.run('nextDay()');assert.equal(g.run('stock(0,0).qty'),4.85);assert.equal(g.run('stock(0,0).basis'),basis*.97);g.run('state=initial();generate();render()');assert.equal(g.run('stockWeight(0)'),0);
});
test('existing contracts still pay out and SVG tracks the shipment',()=>{
 const g=game();g.node('#vehicle').value='2';g.run('dispatch(state.offers[0].id)');assert.equal(g.run('state.jobs.length'),1);assert.ok(g.run('jobs()').includes('<svg'));
 for(let i=0;i<10&&g.run('state.jobs.length');i++)g.run('nextDay()');assert.equal(g.run('state.delivered'),1);assert.ok(g.run('state.revenue')>0);
});
