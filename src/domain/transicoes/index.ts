import { Assumir } from './assumir';
import { Escalonar } from './escalonar';
import { JulgarImprocedente } from './julgar-improcedente';
import { JulgarProcedente } from './julgar-procedente';
import { Reverter } from './reverter';
import { Transicao } from './transicao';

// uma ação nova é uma classe nova em transicoes/ e uma linha aqui
export const TRANSICOES: Transicao[] = [
  new Assumir(),
  new Escalonar(),
  new JulgarProcedente(),
  new JulgarImprocedente(),
  new Reverter(),
];

export function buscarTransicao(acao: string): Transicao | undefined {
  return TRANSICOES.find((t) => t.acao === acao);
}
