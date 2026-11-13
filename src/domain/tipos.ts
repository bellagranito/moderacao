export type Estado =
  | 'RECEBIDA'
  | 'EM_ANALISE'
  | 'ESCALONADA'
  | 'PROCEDENTE'
  | 'IMPROCEDENTE'
  | 'REVERTIDA';

export const ESTADOS_ABERTOS: Estado[] = ['RECEBIDA', 'EM_ANALISE', 'ESCALONADA'];

export type Perfil = 'usuario' | 'moderador' | 'supervisor' | 'sistema';

export type Motivo = 'SPAM' | 'FALSA_INFO' | 'CONTEUDO_IMPROPRIO' | 'ASSEDIO' | 'DISCURSO_ODIO';

export const MOTIVOS: Motivo[] = ['SPAM', 'FALSA_INFO', 'CONTEUDO_IMPROPRIO', 'ASSEDIO', 'DISCURSO_ODIO'];

export type TipoPunicao = 'advertencia' | 'banimento';

export interface Usuario {
  id: number;
  nome: string;
  perfil: Perfil;
  banido: boolean;
}

export interface Postagem {
  id: number;
  autorId: number;
  autorNome: string;
  conteudo: string;
  removida: boolean;
}

export interface Caso {
  id: number;
  postagemId: number;
  autorPostagemId: number;
  estado: Estado;
  score: number;
  prazoSla: Date;
  moderadorId: number | null;
  criadoEm: Date;
  julgadoEm: Date | null;
}

export interface Denuncia {
  id: number;
  casoId: number;
  denuncianteId: number;
  denuncianteNome: string;
  motivo: Motivo;
  descricao: string | null;
  criadaEm: Date;
}

export interface RegistroHistorico {
  id: number;
  idRegistro: number;
  estadoAnterior: Estado | null;
  novoEstado: Estado;
  autorId: number;
  autorNome: string;
  justificativa: string;
  timestamp: Date;
}

export interface Punicao {
  id: number;
  casoId: number;
  usuarioId: number;
  tipo: TipoPunicao;
  ativa: boolean;
  criadaEm: Date;
  revogadaEm: Date | null;
}
