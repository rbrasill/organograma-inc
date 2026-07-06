// Pool MySQL do servidor (rotas /api). Credenciais SEMPRE via .env —
// nunca no repositório (ver .env.example).
import mysql from "mysql2/promise";

let pool;

export function getPool() {
  if (!pool) {
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT } = process.env;
    if (!DB_HOST || !DB_USER || !DB_NAME) {
      const e = new Error(
        "Banco não configurado: defina DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no arquivo .env (ver .env.example)."
      );
      e.codigo = "SEM_CONFIG";
      throw e;
    }
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT || 3306),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      charset: "utf8mb4",
    });
  }
  return pool;
}
