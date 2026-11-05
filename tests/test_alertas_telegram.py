import importlib.util, sys, types, unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
# Carregar funções puras sem credenciais ou acesso à rede.
sys.modules.setdefault('firebase_admin', types.ModuleType('firebase_admin'))
sys.modules.setdefault('firebase_admin.credentials', types.ModuleType('credentials'))
sys.modules.setdefault('firebase_admin.firestore', types.ModuleType('firestore'))
sys.modules.setdefault('requests', types.ModuleType('requests'))
spec=importlib.util.spec_from_file_location('alertas',Path(__file__).resolve().parents[1]/'.github/scripts/processar_telegram.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class AlertasTest(unittest.TestCase):
 def test_nao_expoe_token(self):
  self.assertNotIn('123:abc',a.erro_seguro(Exception('401 bot123:abc/sendMessage'),'123:abc'))
 def test_recuperacao_apenas_falha_entrega_com_intervalo(self):
  agora=datetime.now(timezone.utc)
  self.assertTrue(a.recuperavel({'erroTelegram':'401 Unauthorized'},agora))
  self.assertFalse(a.recuperavel({'erroTelegram':'401','processadoEm':agora},agora))
  self.assertFalse(a.recuperavel({'erroTelegram':'Registro não pertence ao usuário'},agora))
  self.assertTrue(a.recuperavel({'erroTelegram':'Connection timeout','processadoEm':agora-timedelta(hours=7)},agora))
 def test_contexto_limite_e_sem_reafirmar_status_antigo(self):
  original=a.montar_mensagem
  try:
   a.montar_mensagem=lambda db,e:'x'*5000
   texto=a.preparar_aviso(None,{'statusTelegram':'erro','data':datetime.now(timezone.utc)},'id123')
   self.assertLess(len(texto),4096)
   self.assertIn('AVISO RECUPERADO',texto)
   self.assertIn('id123',texto)
   self.assertIn('admin.html',texto)
  finally:a.montar_mensagem=original
if __name__=='__main__':unittest.main()
