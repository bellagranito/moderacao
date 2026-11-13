import { Motivo } from './tipos';

export interface EntradaUrgencia {
  denuncias: { motivo: Motivo; denuncianteId: number }[];
  punicoesAtivasDoAutor: number;
}

export interface RegraUrgencia {
  readonly nome: string;
  pontuar(entrada: EntradaUrgencia): number;
}

// 2 pontos por denúncia, mas com teto: uma enxurrada de denúncias não
// deixa um caso passar na frente de todos os outros para sempre
export class RegraPorVolume implements RegraUrgencia {
  readonly nome = 'volume de denúncias';
  private static readonly PONTOS_POR_DENUNCIA = 2;
  private static readonly MAXIMO_DE_DENUNCIAS = 10;

  pontuar(entrada: EntradaUrgencia): number {
    const contadas = Math.min(entrada.denuncias.length, RegraPorVolume.MAXIMO_DE_DENUNCIAS);
    return contadas * RegraPorVolume.PONTOS_POR_DENUNCIA;
  }
}

export class RegraPorGravidade implements RegraUrgencia {
  readonly nome = 'gravidade do motivo';
  private static readonly PESOS: Record<Motivo, number> = {
    SPAM: 1,
    FALSA_INFO: 2,
    CONTEUDO_IMPROPRIO: 4,
    ASSEDIO: 6,
    DISCURSO_ODIO: 6,
  };

  pontuar(entrada: EntradaUrgencia): number {
    let maior = 0;
    for (const denuncia of entrada.denuncias) {
      maior = Math.max(maior, RegraPorGravidade.PESOS[denuncia.motivo]);
    }
    return maior;
  }
}

export class RegraPorReincidencia implements RegraUrgencia {
  readonly nome = 'reincidência do autor';

  pontuar(entrada: EntradaUrgencia): number {
    return Math.min(entrada.punicoesAtivasDoAutor * 3, 9);
  }
}

export class CalculadoraUrgencia {
  constructor(private readonly regras: RegraUrgencia[]) {}

  calcular(entrada: EntradaUrgencia): number {
    return this.regras.reduce((total, regra) => total + regra.pontuar(entrada), 0);
  }
}

// para criar uma regra nova basta escrever a classe e colocar nesta lista
export const calculadoraPadrao = new CalculadoraUrgencia([
  new RegraPorVolume(),
  new RegraPorGravidade(),
  new RegraPorReincidencia(),
]);
