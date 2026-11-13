export interface PortasTransicao {
  travarLimiteDeAnalise(moderadorId: number): Promise<void>;
  contarCasosEmAnalise(moderadorId: number): Promise<number>;
  removerPostagem(postagemId: number): Promise<void>;
  restaurarPostagem(postagemId: number): Promise<void>;
  registrarPunicao(casoId: number, usuarioId: number, tipo: 'advertencia' | 'banimento'): Promise<void>;
  banirUsuario(usuarioId: number): Promise<void>;
  revogarPunicoesDoCaso(casoId: number): Promise<void>;
  recalcularBanimento(usuarioId: number): Promise<void>;
}
