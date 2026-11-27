import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diasAte} from '../painel-emprestimos.mjs';
test('Everton: vencimento em 28/11 é amanhã durante todo o dia 27 no Brasil',()=>{
 const parcela={vencimento:{toDate:()=>new Date('2026-11-28T20:03:06.420Z')}};
 for(const agora of ['2026-11-27T03:00:00Z','2026-11-27T12:00:00Z','2026-11-28T02:59:59Z'])assert.equal(diasAte(parcela,'BR',new Date(agora)),1);
 assert.equal(diasAte(parcela,'BR',new Date('2026-11-28T03:00:00Z')),0);
});
test('hoje, amanhã, dois dias e atraso ignoram horas e minutos do vencimento',()=>{
 const agora=new Date('2026-11-27T15:00:00Z');
 for(const [dia,dias] of [['26',-1],['27',0],['28',1],['29',2]])for(const hora of ['03:00:00','23:59:59'])assert.equal(diasAte({vencimento:new Date(`2026-11-${dia}T${hora}Z`)},'BR',agora),dias);
});
test('dias de calendário respeitam mudança de horário em Portugal sem arredondar horas',()=>{
 assert.equal(diasAte({vencimento:new Date('2026-03-30T12:00Z')},'PT',new Date('2026-03-28T12:00Z')),2);
 assert.equal(diasAte({vencimento:new Date('2026-10-26T12:00Z')},'PT',new Date('2026-10-24T12:00Z')),2);
});
test('destaque e grupos da central usam o mesmo cálculo de calendário',()=>{
 const html=readFileSync('admin.html','utf8');
 assert.match(html,/diasAte\(dados,emprestimoDaParcela\?\.pais\|\|dados.pais\|\|'BR',new Date\(\)\)/);
 assert.match(html,/diasAte\(proximaParcela,emp.pais\|\|'BR',hoje\)/);
 assert.doesNotMatch(html,/Math.ceil\(\s*\(proximaParcela.vencimento - hoje\)/);
});
