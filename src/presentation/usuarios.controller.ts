import { Controller, Get } from '@nestjs/common';
import { Banco } from '../infrastructure/banco';
import { Publico } from './auth.guard';

@Controller()
export class UsuariosController {
  constructor(private readonly banco: Banco) {}

  // lista aberta só para a tela escolher com qual usuário entrar
  @Publico()
  @Get('usuarios')
  usuarios() {
    return this.banco.repositorio().listarUsuarios();
  }

  @Get('postagens')
  postagens() {
    return this.banco.repositorio().listarPostagens();
  }
}
