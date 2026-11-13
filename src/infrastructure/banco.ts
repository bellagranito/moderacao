import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Repositorio } from './repositorio';

@Injectable()
export class Banco implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/moderacao',
  });

  // repositório para consultas simples, fora de transação
  repositorio(): Repositorio {
    return new Repositorio(this.pool);
  }

  // tudo o que for feito dentro de fn vale junto (COMMIT) ou não vale nada (ROLLBACK)
  async transacao<T>(fn: (repo: Repositorio) => Promise<T>): Promise<T> {
    const cliente: PoolClient = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await fn(new Repositorio(cliente));
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
