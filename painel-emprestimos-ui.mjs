import {corresponde,resumirVencimentos,salvarTelefone} from './painel-emprestimos.mjs';
export function iniciarPainelEmprestimos(api,items){
 const root=document.getElementById('ferramentasEmprestimos');
 root.innerHTML=`<div class="card"><div class="filtrosEmprestimos">
 <label>Pesquisar cliente<input id="buscaEmprestimos" type="search" placeholder="Nome, email ou telefone"></label>
 <label>Situação<select id="situacaoEmprestimos"><option value="abertos">Em aberto</option><option value="quitados">Quitados</option><option value="">Todos</option></select></label>
 <label>Vencimento<select id="prazoEmprestimos"><option value="">Todos</option><option value="atrasado">Atrasados</option><option value="hoje">Vence hoje</option><option value="cinco">Próximos 5 dias</option></select></label>
 <label>País<select id="paisEmprestimos"><option value="">Todos</option><option value="BR">Brasil</option><option value="PT">Portugal</option></select></label>
 <label>Pagamentos<select id="pagamentoEmprestimos"><option value="">Todos</option><option value="sem">Sem pagamento recebido</option></select></label>
 </div><button type="button" id="limparFiltrosEmprestimos">Limpar filtros</button>
 <p id="resultadoEmprestimos" role="status" aria-live="polite"></p>
 <p style="color:var(--text-soft)">Resumo dos empréstimos filtrados. Próximos 5 dias: de amanhã até ao quinto dia. Valores previstos; recebimento não garantido.</p>
 <div id="resumoVencimentosEmprestimos" class="resumoEmprestimos"></div></div>`;
 const busca=root.querySelector('#buscaEmprestimos'),prazo=root.querySelector('#prazoEmprestimos'),pais=root.querySelector('#paisEmprestimos'),pagamento=root.querySelector('#pagamentoEmprestimos');
 const situacao=root.querySelector('#situacaoEmprestimos');
 const money=(v,p)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:p==='PT'?'EUR':'BRL'}).format(v);
 function atualizar(){
  const filtros={busca:busca.value,prazo:prazo.value,pais:pais.value,pagamento:pagamento.value,situacao:situacao.value};
  const visiveis=items.filter(item=>corresponde(item,filtros));
  for(const item of items)item.div.hidden=!visiveis.includes(item);
  root.querySelector('#resultadoEmprestimos').textContent=visiveis.length?`${visiveis.length} de ${items.length} empréstimos encontrados.`:'Nenhum empréstimo corresponde aos filtros.';
  const resumo=resumirVencimentos(visiveis);
  root.querySelector('#resumoVencimentosEmprestimos').replaceChildren(...Object.entries(resumo).map(([k,r])=>{
   const card=document.createElement('div');card.className='resumoEmprestimo';
   const titulo=document.createElement('strong');titulo.textContent={atrasado:'Em atraso',hoje:'Vence hoje',cinco:'Próximos 5 dias'}[k];
   const dados=document.createElement('p');dados.textContent=`${r.clientes} cliente(s) · ${r.parcelas} parcela(s)`;
   const valores=document.createElement('p');valores.textContent=money(r.BR,'BR')+' / '+money(r.PT,'PT');
   const nota=document.createElement('small');nota.textContent=k==='atrasado'?'Inclui juros e multa até hoje, conforme cada parcela.':'Saldo das parcelas em aberto.';
   card.append(titulo,dados,valores,nota);return card;
  }));
 }
 busca.addEventListener('input',atualizar);
 for(const el of [prazo,pais,pagamento,situacao])el.addEventListener('change',atualizar);
 root.querySelector('#limparFiltrosEmprestimos').addEventListener('click',()=>{for(const el of [busca,prazo,pais,pagamento,situacao])el.value='';situacao.value='abertos';atualizar();});
 for(const item of items){
  const host=document.createElement('div');host.className='telefoneEmprestimo';
  const label=document.createElement('p');label.textContent='Telefone: '+(item.emp.telefoneCliente||'Não informado');
  const editar=document.createElement('button');editar.type='button';editar.textContent='Editar telefone';
  const form=document.createElement('form');form.hidden=true;
  const campoLabel=document.createElement('label');campoLabel.textContent='Telefone com indicativo do país';
  const input=document.createElement('input');input.type='tel';input.required=true;input.autocomplete='tel';input.value=item.emp.telefoneCliente||'';campoLabel.append(input);
  const nota=document.createElement('small');nota.textContent='Atualiza este empréstimo e o cadastro do cliente. Exemplo: '+(item.emp.pais==='PT'?'+351 931 714 823':'+55 51 99999-1234');
  const salvar=document.createElement('button');salvar.type='submit';salvar.textContent='Salvar telefone';
  const cancelar=document.createElement('button');cancelar.type='button';cancelar.textContent='Cancelar';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  form.append(campoLabel,nota,document.createElement('br'),salvar,cancelar);
  host.append(label,editar,form,status);item.div.querySelector('.contatoEmprestimo').append(host);
  editar.addEventListener('click',()=>{form.hidden=false;editar.hidden=true;input.value=item.emp.telefoneCliente||'';input.focus();status.textContent='';});
  cancelar.addEventListener('click',()=>{form.hidden=true;editar.hidden=false;status.textContent='';});
  form.addEventListener('submit',async event=>{
   event.preventDefault();salvar.disabled=cancelar.disabled=input.disabled=true;status.textContent='A salvar o telefone…';
   try{
    const telefone=await salvarTelefone(api,item,input.value);
    item.emp.telefoneCliente=telefone;
    // Keep the concurrency baseline for other loans of the same client current.
    for(const other of items)if(other.emp.userId&&other.emp.userId===item.emp.userId)other.telefoneCadastro=telefone;
    label.textContent='Telefone: '+telefone;form.hidden=true;editar.hidden=false;
    status.textContent='Telefone salvo. Os botões de WhatsApp deste empréstimo já usam o novo número.';atualizar();
   }catch(error){status.textContent=error.message||'Não foi possível salvar. Tente novamente.';}
   finally{salvar.disabled=cancelar.disabled=input.disabled=false;}
  });
 }
 atualizar();
}
