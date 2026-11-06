import importlib.util, sys, types, unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
# Carregar funções puras sem credenciais ou acesso à rede.
sys.modules.setdefault('firebase_admin', types.ModuleType('firebase_admin'))
sys.modules.setdefault('firebase_admin.credentials', types.ModuleType('credentials'))
sys.modules.setdefault('firebase_admin.firestore', types.ModuleType('firestore'))
sys.modules.setdefault('requests', types.ModuleType('requests'))
sys.modules['firebase_admin.firestore'].transactional=lambda fn: fn
spec=importlib.util.spec_from_file_location('alertas',Path(__file__).resolve().parents[1]/'.github/scripts/processar_telegram.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class AlertasTest(unittest.TestCase):
 def test_nao_expoe_token(self):
  self.assertNotIn('123:abc',a.erro_seguro(Exception('401 bot123:abc/sendMessage'),'123:abc'))
 def test_bloqueia_antigos_sem_data_e_anteriores_ao_corte(self):
  agora=max(datetime.now(timezone.utc),a.NAO_ENVIAR_ANTES)+timedelta(seconds=1)
  self.assertTrue(a.aviso_atual({'data':agora},agora))
  self.assertFalse(a.aviso_atual({},agora))
  self.assertFalse(a.aviso_atual({'data':agora-timedelta(days=1)},agora))
  self.assertFalse(a.aviso_atual({'data':a.NAO_ENVIAR_ANTES-timedelta(seconds=1)},agora))
  self.assertFalse(a.aviso_atual({'data':agora},agora+timedelta(hours=2)))
 def test_contexto_limite_e_sem_reafirmar_status_antigo(self):
  original=a.montar_mensagem
  try:
   a.montar_mensagem=lambda db,e:'x'*5000
   texto=a.preparar_aviso(None,{'statusTelegram':'erro','data':datetime.now(timezone.utc)},'id123')
   self.assertLess(len(texto),4096)
   self.assertNotIn('AVISO RECUPERADO',texto)
   self.assertIn('id123',texto)
   self.assertIn('admin.html',texto)
  finally:a.montar_mensagem=original
if __name__=='__main__':unittest.main()
