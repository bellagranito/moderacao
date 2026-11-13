import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CasoService } from '../application/caso.service';
import { ErroDominio } from '../domain/erros';
import { Usuario } from '../domain/tipos';
import { UsuarioLogado } from './auth.guard';

function lerId(valor: string): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErroDominio('DADOS_INVALIDOS', 'Id inválido.');
  return id;
}

@Controller('casos')
export class CasosController {
  constructor(private readonly service: CasoService) {}

  @Get()
  listar(@UsuarioLogado() usuario: Usuario, @Query('estado') estado?: string) {
    return this.service.listar(usuario, estado);
  }

  @Get(':id')
  detalhar(@UsuarioLogado() usuario: Usuario, @Param('id') id: string) {
    return this.service.detalhar(lerId(id), usuario);
  }

  // não existe rota para editar o estado: ele só muda por ações
  @Post(':id/acoes/:acao')
  @HttpCode(200)
  executar(
    @UsuarioLogado() usuario: Usuario,
    @Param('id') id: string,
    @Param('acao') acao: string,
    @Body() corpo: any,
  ) {
    return this.service.executar(lerId(id), acao, usuario, corpo ?? {});
  }
}
