import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linhaExtrato,detalhesExtrato} from '../extrato-detalhes.mjs';
const fmt=v=>'R$ '+Number(v||0).toFixed(2);
test('mostra acordo e mantém pago registrado sem recalcular histórico',()=>{
 const p={numero:1,valor:320,pago:320,status:'pago',valorAntesAcordo:350,restanteAntesAcordo:350,valorAcordado:320,acordoAtivo:true};
 const antes=JSON.stringify(p);const html=linhaExtrato(p,fmt);
 assert.match(html,/Acordo registrado/);assert.match(html,/350.00/);assert.match(html,/320.00/);assert.equal(JSON.stringify(p),antes);
});
test('distingue recebimento de cálculo e mostra falta de histórico',()=>{
 const h=detalhesExtrato({valor:100,pago:100,status:'pago',perfilPagamento:'atrasado',diasDiferenca:3,juros:3,multa:5},fmt);
 assert.match(h,/recebimento não discriminado/);assert.match(h,/não discrimina os encargos/);assert.doesNotMatch(h,/Juros pagos registrados/);
 assert.match(detalhesExtrato({jurosPagos:3,multaPaga:5},fmt),/Juros pagos registrados/);
});
test('acordo sem encargos e perda têm rótulos próprios e escapam HTML',()=>{
 assert.match(linhaExtrato({numero:'<script>',status:'perdido',acordoSemEncargos:true},fmt),/Encerrada como perda/);
 assert.match(linhaExtrato({numero:'<script>'},fmt),/&lt;script&gt;/);
 assert.match(detalhesExtrato({acordoSemEncargos:true},fmt),/sem multa e juros/);
});
