import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErroDominio } from '../domain/erros';
import { Usuario } from '../domain/tipos';
import { Banco } from '../infrastructure/banco';

export const Publico = () => SetMetadata('publico', true);

export const UsuarioLogado = createParamDecorator((_dado: unknown, contexto: ExecutionContext): Usuario => {
  return contexto.switchToHttp().getRequest().usuario;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly banco: Banco,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>('publico', [contexto.getHandler(), contexto.getClass()]);
    if (publico) return true;

    const requisicao = contexto.switchToHttp().getRequest();
    const id = Number(requisicao.headers['x-usuario-id']);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ErroDominio('NAO_AUTENTICADO', 'Informe o usuário no header x-usuario-id.');
    }

    const usuario = await this.banco.repositorio().buscarUsuario(id);
    if (!usuario) throw new ErroDominio('NAO_AUTENTICADO', 'Usuário não encontrado.');

    requisicao.usuario = usuario;
    return true;
  }
}
