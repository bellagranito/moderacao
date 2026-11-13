export type CodigoErro =
  | 'DADOS_INVALIDOS'
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'TRANSICAO_INVALIDA'
  | 'REGRA_NEGOCIO';

export class ErroDominio extends Error {
  constructor(
    public readonly codigo: CodigoErro,
    mensagem: string,
  ) {
    super(mensagem);
  }
}
