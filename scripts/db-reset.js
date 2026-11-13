const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const url = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/moderacao';

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  for (const arquivo of ['schema.sql', 'seed.sql']) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'infrastructure', arquivo), 'utf8');
    await client.query(sql);
    console.log(arquivo + ' executado');
  }
  await client.end();
}

main().catch((erro) => {
  console.error('Não foi possível resetar o banco:', erro.message);
  process.exit(1);
});
