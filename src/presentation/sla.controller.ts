import { Controller, HttpCode, Post } from '@nestjs/common';
import { SlaService } from '../application/sla.service';
import { ErroDominio } from '../domain/erros';
import { Usuario } from '../domain/tipos';
import { UsuarioLogado } from './auth.guard';

@Controller('sla')
export class SlaController {
  constructor(private readonly service: SlaService) {}

  // dispara a verificação na hora, sem esperar o temporizador
  @Post('executar')
  @HttpCode(200)
  executar(@UsuarioLogado() usuario: Usuario) {
    if (usuario.perfil !== 'supervisor' && usuario.perfil !== 'sistema') {
      throw new ErroDominio('SEM_PERMISSAO', 'Somente supervisor ou sistema executa a verificação de SLA.');
    }
    return this.service.escalarVencidos();
  }
}
