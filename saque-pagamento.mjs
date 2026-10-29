// Adaptador transacional: não envia dinheiro; apenas registra confirmação administrativa.
export async function registrarPagamentoSaque({db, id, doc, runTransaction, serverTimestamp, increment}) {
  if (typeof id !== 'string' || !id || id.includes('/')) throw Error('Saque inválido.');
  const ref = doc(db, 'saques', id);
  try { return await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw Error('Saque não encontrado.');
    const saque = snap.data();
    if (saque.status === 'pago') return { jaPago: true };
    if (saque.status !== 'pendente') throw Error('O saque não está pendente.');
    const moedas = saque.isaCoins, valor = saque.valor;
    if (!Number.isSafeInteger(moedas) || moedas <= 0 || !['BR','PT'].includes(saque.pais) ||
        !Number.isFinite(valor) || valor <= 0 ||
        Math.abs(valor - Number((moedas * (saque.pais === 'PT' ? .002 : .01)).toFixed(2))) > .000001) {
      throw Error('Valor e moedas divergentes; conferir o saque antes da baixa.');
    }
    if (saque.moedasReservadas === true && (moedas !== 10000 || saque.versaoMoedas !== 2)) throw Error('Reserva incompatível.');
    const userRef = doc(db, 'usuarios', saque.userId);
    const user = await tx.get(userRef);
    if (!user.exists()) throw Error('Cliente não encontrado; baixa cancelada.');
    const u = user.data(), saldo = u.isaCoins ?? 0, reserva = u.isaCoinsReservadas ?? 0, sacadas = u.isaCoinsSacadas ?? 0;
    if (![saldo,reserva,sacadas].every(n => Number.isSafeInteger(n) && n >= 0) || !Number.isSafeInteger(sacadas + moedas)) throw Error('Saldo inconsistente.');
    const reservado = saque.moedasReservadas === true;
    if ((reservado ? reserva : saldo) < moedas) throw Error('Saldo insuficiente para registrar a baixa; conferir extrato.');
    // Pedidos antigos não são recalculados: preserva valor originalmente solicitado.
    tx.update(userRef, {isaCoins: reservado ? saldo : saldo - moedas,
      isaCoinsReservadas: reservado ? reserva - moedas : reserva, isaCoinsSacadas: sacadas + moedas});
    tx.update(ref, {status:'pago', pagoEm:serverTimestamp(), baixaMoedasEm:serverTimestamp()});
    tx.set(doc(db,'configuracoes','financeiro'), {['impactoCaixa'+saque.pais]:increment(-valor)}, {merge:true});
    tx.set(doc(db,'movimentacoesCaixa','saque-'+id), {tipo:'saqueIsaCoin',pais:saque.pais,
      moeda:saque.pais === 'PT' ? '€' : 'R$',valor:-valor,motivo:'Saque Clube ISAcoin',
      criadoEm:serverTimestamp(),origem:'admin',saqueId:id});
    return {jaPago:false};
  }); } catch(error) {
    // Rules podem recusar uma segunda baixa antes de o SDK detectar o conflito.
    // Confirmar apenas por leitura; nunca repetir a escrita após erro incerto.
    if(error.code === 'permission-denied' || error.code === 'failed-precondition') {
      const confirmed = await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        return snap.exists() && snap.data().status === 'pago';
      });
      if(confirmed) return {jaPago:true};
    }
    throw error;
  }
}
