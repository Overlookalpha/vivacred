import test from 'node:test';
import assert from 'node:assert/strict';
import {conferirCadastro,resumirPendencias} from '../central-pendencias.mjs';
const completo={id:'u',nome:'Cliente',telefone:'+5551999990000',email:'cliente@example.test',cpf:'12345678901',pix:'chave@example.test',pais:'BR'};
test('cadastro aponta campos ausentes e placeholder sem tratar formatos variados de Pix como inválidos',()=>{
 assert.deepEqual(conferirCadastro(completo),[]);
 assert.match(conferirCadastro({...completo,pix:'Teste'}).join(),/preenchimento de teste/);
 assert.equal(conferirCadastro({}).length,5);
 assert.deepEqual(conferirCadastro({...completo,pais:'PT',cpf:'123456789',telefone:'+351931714823'}),[]);
 for(const pix of ['+55 (51) 99999-0000','123.456.789-01','f20f0b70-0b0c-4afe-9d58-2740c8878b13'])assert.deepEqual(conferirCadastro({...completo,pix}),[]);
 assert.match(conferirCadastro({...completo,telefone:'abc',email:'sem-arroba',cpf:'00000000000'}).join(),/Telefone.*E-mail.*CPF/);
});
test('agrupa pendências e exclui testes, parcelas pagas e empréstimos encerrados',()=>{
 const base={usuarios:[completo,{id:'novo',status:'pendente_aprovacao'},{id:'teste',teste:true,status:'pendente_aprovacao'}],
  emprestimos:[{id:'l',userId:'u',status:'ativo'},{id:'p',userId:'u',status:'aguardando'},{id:'t',teste:true,status:'aguardando'},{id:'f',status:'finalizado'}],
  parcelas:[{id:'1',emprestimoId:'l',valor:100,pago:0,pagamentoInformadoEm:new Date('2026-11-26')},{id:'2',emprestimoId:'l',valor:100,pago:100,pagamentoInformadoEm:new Date('2026-11-26')},{id:'3',emprestimoId:'f',valor:100,pago:0,pagamentoInformadoEm:new Date('2026-11-26')}],
  promessas:[{id:'n',parcelaId:'1',status:'ativa',data:'2026-11-25'},{id:'n2',parcelaId:'1',status:'ativa',data:'2026-11-25'},{id:'paga',parcelaId:'2',status:'ativa',data:'2026-11-25'}]};
 const antes=JSON.stringify(base),r=resumirPendencias(base,new Date('2026-11-27T12:00Z'));
 assert.equal(r.contas.length,1);assert.equal(r.pedidos.length,1);assert.equal(r.pagamentos.length,1);assert.equal(r.pagamentos[0].nome,'Cliente');assert.equal(r.vencidas.length,1);assert.equal(r.cadastros.length,1);assert.equal(JSON.stringify(base),antes);
});
test('promessa para hoje não vence antes do fim do dia; inconsistências são sinalizadas',()=>{
 const data={emprestimos:[{id:'l',pais:'PT',status:'ativo'}],parcelas:[{id:'p',emprestimoId:'l',valor:100}],promessas:[{id:'h',parcelaId:'p',status:'ativa',data:'2026-11-27'},{id:'i',parcelaId:'p',status:'ativa',data:'errada'},{id:'s',parcelaId:'sumiu',status:'ativa',data:'2026-11-20'}]};
 const r=resumirPendencias(data,new Date('2026-11-27T23:00Z'));assert.equal(r.vencidas.length,0);assert.equal(r.conferir.length,2);
});
test('pagamento parcial conferido sai da fila até nova informação do cliente',()=>{
 const p={id:'p',emprestimoId:'l',valor:100,pago:50,pagamentoInformadoEm:new Date('2026-11-25'),ultimaDataPagamento:new Date('2026-11-26')};
 const dados={emprestimos:[{id:'l',status:'ativo'}],parcelas:[p]};assert.equal(resumirPendencias(dados).pagamentos.length,0);
 p.pagamentoInformadoEm=new Date('2026-11-27');assert.equal(resumirPendencias(dados).pagamentos.length,1);
});
