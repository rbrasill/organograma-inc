// Autenticação passwordless por código de e-mail.
//  - hashCodigo: o banco guarda SÓ o SHA-256 do código (auth_codigo.codigo_hash);
//    comparar hashes também evita expor o código em logs de query.
//  - sessão: token assinado (HMAC-SHA256) guardado em cookie httpOnly — sem
//    tabela de sessão, o MySQL fica fora de cada request autenticada.
// Requer no .env: AUTH_SESSION_SECRET (assinatura) — ver .env.example.

import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";

export const COOKIE_SESSAO = "inc_sessao";
export const SESSAO_HORAS = 8;

export function gerarCodigo() {
  // criptograficamente seguro (Math.random não serve para OTP)
  return String(randomInt(100000, 1000000));
}

export function hashCodigo(codigo) {
  return createHash("sha256").update(String(codigo)).digest("hex");
}

function segredoSessao() {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) {
    const e = new Error(
      "Autenticação não configurada: defina AUTH_SESSION_SECRET no .env (ver .env.example)."
    );
    e.codigo = "SEM_CONFIG";
    throw e;
  }
  return s;
}

const b64url = (s) => Buffer.from(s).toString("base64url");

// token: base64url(payload JSON) + "." + HMAC — payload { email, nome, exp }
export function assinarSessao({ email, nome }) {
  const payload = b64url(JSON.stringify({
    email,
    nome,
    exp: Date.now() + SESSAO_HORAS * 60 * 60 * 1000,
  }));
  const assinatura = createHmac("sha256", segredoSessao()).update(payload).digest("base64url");
  return `${payload}.${assinatura}`;
}

// devolve { email, nome, exp } se o token for válido e não expirado; senão null
export function verificarSessao(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, assinatura] = token.split(".");
  try {
    const esperada = createHmac("sha256", segredoSessao()).update(payload).digest();
    const recebida = Buffer.from(assinatura, "base64url");
    if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!dados.exp || Date.now() > dados.exp) return null;
    return dados;
  } catch {
    return null;
  }
}

// atributos do cookie de sessão (httpOnly: o JS do navegador nunca lê o token)
export function cookieSessao(token) {
  const maxAge = SESSAO_HORAS * 60 * 60;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_SESSAO}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}
