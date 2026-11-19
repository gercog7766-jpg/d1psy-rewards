import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { savingsScript } from '../src/savings-ui.ts';

test('savings loads even when color controls are absent from the page', async () => {
  const elements = new Map();
  const ids = ['savingsBalance','setup','active','start','startForm','goalAt','extendAt','notice','deposit','extend','cancelExtend','confirmExtend','break','goalLabel','readyActions','extendForm','amountField','dateField','extendAmountField','extendDateField'];
  for (const id of ids) elements.set(id, {textContent:'',hidden:false,disabled:true,value:'',min:'',style:{setProperty(){}},classList:{toggle(){}}});
  const calls = [];
  const document = {
    body:{dataset:{admin:'false'}},
    getElementById:id=>elements.get(id)??null,
    querySelectorAll:()=>[],
  };
  const context = {
    document,
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
    fetch:async url=>{
      calls.push(url);
      return {ok:true,json:async()=>({balance:750,status:'idle',colors:{},nextActivationFee:0,nextCommissionBps:0})};
    },
    Intl, Date, Number, Object, Error, console,
  };
  // The live regression was a missing color control throwing before load().
  // Keep the essential savings controls while omitting all optional color widgets.
  vm.runInNewContext(savingsScript, context);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(calls,['/api/savings']);
  assert.match(elements.get('savingsBalance').textContent,/750/);
  assert.equal(elements.get('start').disabled,false);
});
