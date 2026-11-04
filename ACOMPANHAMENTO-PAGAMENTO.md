# Estimativa e promessa de pagamento — administrador

No dashboard administrativo, em Próximo Vencimento e nos itens em atraso:
- Estimar para outra data: consulta parcela e empréstimo atuais; reaproveita a regra do administrador, extraída sem alterar taxas. Mostra data, dias de atraso, multa, juros, pagamentos e total; permite copiar o texto, sem enviá-lo.
- Registrar promessa: data, observação e alcance (cliente ou parcela). Persiste aviso e histórico em transação administrativa, sem escrever dívida, vencimento ou saldo. Prazo inclui o fim do dia no país BR/PT do empréstimo; no dia seguinte aparece como vencido.
- Contatos pelos atalhos WhatsApp/Cobrar Agora do dashboard são conferidos em dados atuais e bloqueados durante o prazo. Falha de consulta não libera a cobrança. Esta integração não pausa sistemas externos ou contatos fora destes atalhos.

Persistência: promessasPagamento e historicoPromessasPagamento, sob a autorização administrativa já existente em firestore.rules. Não foram alteradas regras, funções de empréstimo, saques, juros ou pagamentos. O cancelamento mantém histórico e não apaga documentos.

Verificação: 51 testes passaram com node --experimental-vm-modules --test tests/*.test.mjs; 10 testes de emulador preexistentes foram ignorados por falta de configuração desse ambiente. Conferência visual com dados fictícios, sem Firebase real: projeção de R$1.000 de 01/11 para 10/11/2026 resultou em R$1.140 conforme a regra existente; aviso para 10/11 apareceu no dashboard. Nenhum cliente real foi alterado e nenhuma mensagem foi enviada.
