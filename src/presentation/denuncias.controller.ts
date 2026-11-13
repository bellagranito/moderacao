import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DenunciaService } from '../application/denuncia.service';
import { Usuario } from '../domain/tipos';
import { UsuarioLogado } from './auth.guard';

@Controller('denuncias')
export class DenunciasController {
  constructor(private readonly service: DenunciaService) {}

  @Post()
  @HttpCode(201)
  registrar(@UsuarioLogado() usuario: Usuario, @Body() corpo: any) {
    return this.service.registrar(usuario, corpo);
  }
}
