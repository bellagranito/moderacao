import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { CodigoErro, ErroDominio } from '../domain/erros';

const STATUS_POR_CODIGO: Record<CodigoErro, number> = {
  DADOS_INVALIDOS: 400,
  NAO_AUTENTICADO: 401,
  SEM_PERMISSAO: 403,
  NAO_ENCONTRADO: 404,
  TRANSICAO_INVALIDA: 422,
  REGRA_NEGOCIO: 422,
};

@Catch()
export class FiltroDeErros implements ExceptionFilter {
  catch(erro: unknown, host: ArgumentsHost) {
    const resposta = host.switchToHttp().getResponse();

    if (erro instanceof ErroDominio) {
      resposta.status(STATUS_POR_CODIGO[erro.codigo]).json({ codigo: erro.codigo, mensagem: erro.message });
      return;
    }
    if (erro instanceof HttpException) {
      resposta.status(erro.getStatus()).json({ codigo: 'HTTP', mensagem: erro.message });
      return;
    }

    console.error(erro);
    resposta.status(500).json({ codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado no servidor.' });
  }
}
