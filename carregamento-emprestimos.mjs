// Índice somente em memória; cada parcela fica no seu contrato original.
export function agruparParcelasEmprestimos(docs){
 const grupos=new Map();
 for(const doc of docs){
  const parcela={...doc.data(),id:doc.id};
  if(!parcela.emprestimoId)continue;
  const grupo=grupos.get(parcela.emprestimoId)||[];
  grupo.push(parcela);grupos.set(parcela.emprestimoId,grupo);
 }
 return grupos;
}
