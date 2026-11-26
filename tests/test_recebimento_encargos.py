import ast
import unittest
from datetime import date, datetime
from pathlib import Path

source = (Path(__file__).resolve().parents[1] / '.github/scripts/resumo_diario.py').read_text(encoding='utf-8')
tree = ast.parse(source)
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'calcular_cobranca_parcela')
namespace = {}
exec(compile(ast.Module(body=[function], type_ignores=[]), 'calculo-isolado', 'exec'), namespace)
calculate = namespace['calcular_cobranca_parcela']

class RecebimentoEncargosTest(unittest.TestCase):
    def test_resumo_nao_cobra_encargos_ja_recebidos(self):
        parcel = dict(valor=350, pago=75.5, vencimento=date(2026,11,24), jurosMoraRecebidosSeparados=7, multaRecebidaSeparada=17.5)
        result = calculate(parcel, date(2026,11,27))
        self.assertEqual(result['juros'], 3.5)
        self.assertEqual(result['multa'], 0)
        self.assertEqual(result['totalAtualizado'], 278)

    def test_campos_antigos_nao_sao_subtraidos_novamente(self):
        result = calculate(dict(valor=350, pago=100, vencimento=date(2026,11,24), jurosPagos=7, multaPaga=17.5), date(2026,11,26))
        self.assertEqual(result['totalAtualizado'], 274.5)
