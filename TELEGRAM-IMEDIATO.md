# Avisos imediatos de clientes

Ativado no Firebase `vivacred-5a5b8`: `enviarTelegramClienteImediato`, região europe-west1, gatilho de criação em `notificacoes/{avisoId}`.

Eventos: cadastro, empréstimo, saque, atendimento, negociação, abertura de pagamento e informação de pagamento. O relatório diário não é processado por esse emissor.

Chaves mantidas no Secret Manager. Transferência inicial do GitHub concluída; permissão temporária de gravação e rotina de transferência removidas. A conta de execução tem leitura somente nos dois segredos necessários.

O emissor reserva o aviso em transação, envia ao administrador e marca entrega. Falhas ficam pendentes para a fila GitHub. A fila também reserva em transação, evitando disputa com o emissor. Uma interrupção após o Telegram aceitar e antes de gravar a entrega ainda pode causar duplicação na recuperação; a API Telegram não oferece chave de idempotência para sendMessage.

Envio por evento, sem esperar o agendamento; não existe garantia de latência zero (inicialização, conexão e serviços podem atrasar). Confirmar pagamento informado pelo cliente não realiza baixa.

Verificação: testes locais passaram e função confirmada ACTIVE. Nenhuma ação financeira real foi criada para testar o disparo.
