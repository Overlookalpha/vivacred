import sys, unittest
from pathlib import Path
from datetime import date
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.github/scripts'))
from relatorio_telegram import promessa_atual, montar_relatorio

class RelatorioTest(unittest.TestCase):
    def test_promessa_inclusiva_e_isolada(self):
        a={'parcela-1': {'status':'ativa','data':'2026-11-09'}}
        self.assertIsNotNone(promessa_atual(a,'1','u',date(2026,11,9)))
        self.assertIsNone(promessa_atual(a,'1','u',date(2026,11,10)))
        self.assertIsNone(promessa_atual(a,'2','u',date(2026,11,9)))
        a['parcela-1']['data']='erro'
        self.assertTrue(promessa_atual(a,'1','u',date(2026,11,9))['invalida'])

    def test_cartoes_separam_promessa_de_texto(self):
        zero={'BR':0,'PT':0}
        d={k:zero for k in ['caixaDisponivel','dinheiroNaRua','totalAReceber','aportes','lucroLiquido','repasseEvelyn']}
        d.update(clientesTotal=2,clientesAtivos=2,isacoinTotalCirculacao=0,vencendo=[],proximosSaques=[],aniversariosHoje=[],aniversarios7Dias=[])
        item={'nome':'Ana <teste>','telefone':'000','parcela':'1 de 2','diasAtraso':2,'valor':374.5,'pais':'BR','vencimento':'03/11/2026','juros':7,'multa':17.5,'original':350}
        d['atrasados']=[dict(item,promessa={'data':'2026-11-09'},estimativaPromessa={'totalAtualizado':388.5,'juros':21}),dict(item,nome='Outro',promessa=None)]
        mensagens=montar_relatorio(d,True)
        texto='\n'.join(mensagens)
        self.assertIn('PRÉVIA',texto)
        self.assertIn('388,50',texto)
        self.assertIn('Ana &lt;teste&gt;',texto)
        copias=[m for m in mensagens if '<pre>' in m]
        self.assertEqual(len(copias),1)
        self.assertIn('Outro',copias[0])
        self.assertNotIn('Ana',copias[0])
        self.assertTrue(all(len(m)<4096 for m in mensagens))

if __name__=='__main__':unittest.main()
