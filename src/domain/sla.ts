export type FaixaUrgencia = 'ALTA' | 'MEDIA' | 'BAIXA';

export const HORAS_DE_SLA: Record<FaixaUrgencia, number> = {
  ALTA: 2,
  MEDIA: 8,
  BAIXA: 24,
};

export function faixaDoScore(score: number): FaixaUrgencia {
  if (score >= 15) return 'ALTA';
  if (score >= 7) return 'MEDIA';
  return 'BAIXA';
}

export function calcularPrazo(inicio: Date, score: number): Date {
  const horas = HORAS_DE_SLA[faixaDoScore(score)];
  return new Date(inicio.getTime() + horas * 60 * 60 * 1000);
}

// quando o score sobe o prazo só pode encurtar, nunca ganhar tempo
export function prazoAtualizado(prazoAtual: Date, inicio: Date, novoScore: number): Date {
  const novo = calcularPrazo(inicio, novoScore);
  return novo.getTime() < prazoAtual.getTime() ? novo : prazoAtual;
}

export function slaVencido(prazo: Date, agora: Date): boolean {
  return prazo.getTime() < agora.getTime();
}
