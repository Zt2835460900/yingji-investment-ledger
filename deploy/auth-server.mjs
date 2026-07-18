import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";

const socketPath = process.env.AUTH_SOCKET || "/run/yingji-auth/auth.sock";
const authFile =
  process.env.AUTH_FILE || "/var/lib/yingji-auth/credentials.htpasswd";
const publicOrigin =
  process.env.PUBLIC_ORIGIN || "https://yingji.kivelo0017.xyz";
const opensslBin = process.env.OPENSSL_BIN || "/usr/bin/openssl";
const maximumBodyBytes = 8 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function safeEqual(left, right) {
  const leftDigest = createHash("sha256").update(String(left)).digest();
  const rightDigest = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function parseBasicAuthorization(value) {
  if (!value || !value.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function credentialValidationError({
  currentPassword,
  newUsername,
  newPassword,
}) {
  if (!currentPassword) return "请输入当前密码";
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(newUsername))
    return "登录账号需为 3–32 位字母、数字、点、下划线或短横线";
  if (newPassword.length < 12 || newPassword.length > 128)
    return "新密码长度需为 12–128 位";
  if (!/^[\x20-\x7e]+$/.test(newPassword))
    return "新密码请仅使用可打印的英文字母、数字和符号";
  const categories = [
    /[a-z]/.test(newPassword),
    /[A-Z]/.test(newPassword),
    /\d/.test(newPassword),
    /[^A-Za-z0-9]/.test(newPassword),
  ].filter(Boolean).length;
  if (categories < 3)
    return "新密码至少包含大写字母、小写字母、数字、符号中的三类";
  if (newPassword.toLowerCase().includes(newUsername.toLowerCase()))
    return "新密码不能包含登录账号";
  if (safeEqual(currentPassword, newPassword))
    return "新密码不能与当前密码相同";
  return null;
}

export function isTrustedWriteOrigin(headers) {
  if (headers["sec-fetch-site"] === "cross-site") return false;
  return headers.origin === publicOrigin;
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodyBytes) throw new HttpError(413, "请求内容过大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "请求格式无效");
  }
}

function sha512Crypt(password, salt = "") {
  return new Promise((resolve, reject) => {
    const arguments_ = ["passwd", "-6"];
    if (salt) arguments_.push("-salt", salt);
    arguments_.push("-stdin");
    const child = spawn(opensslBin, arguments_, {
      env: { LANG: "C", PATH: "/usr/bin:/bin" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const hash = stdout.trim();
      if (code === 0 && /^\$6\$[^\r\n]+$/.test(hash)) resolve(hash);
      else reject(new Error(stderr.trim() || "openssl failed"));
    });
    child.stdin.end(`${password}\n`);
  });
}

async function verifyAuthorization(authorization) {
  const line = (await fs.readFile(authFile, "utf8")).split(/\r?\n/, 1)[0];
  const separator = line.indexOf(":");
  if (separator < 1) return false;
  const username = line.slice(0, separator);
  const storedHash = line.slice(separator + 1);
  const parts = storedHash.split("$");
  if (parts[1] !== "6" || !/^[./A-Za-z0-9]{1,16}$/.test(parts[2] || ""))
    return false;
  const candidateHash = await sha512Crypt(authorization.password, parts[2]);
  return (
    safeEqual(authorization.username, username) &&
    safeEqual(candidateHash, storedHash)
  );
}

async function replaceCredentials(username, password) {
  const hash = await sha512Crypt(password);
  const folder = dirname(authFile);
  const temporaryFile = join(
    folder,
    `.credentials-${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  try {
    await fs.writeFile(temporaryFile, `${username}:${hash}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o640,
    });
    const handle = await fs.open(temporaryFile, "r");
    await handle.sync();
    await handle.close();
    await fs.rename(temporaryFile, authFile);
    await fs.chmod(authFile, 0o640);
  } catch (error) {
    await fs.unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
}

function json(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function handleRequest(request, response) {
  if (request.url === "/health") {
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.url !== "/credentials") throw new HttpError(404, "接口不存在");

  const authorization = parseBasicAuthorization(request.headers.authorization);
  const authenticatedUser = String(
    request.headers["x-authenticated-user"] || "",
  );
  const verified = authorization
    ? await verifyAuthorization(authorization).catch(() => false)
    : false;
  if (
    !authorization ||
    !safeEqual(authorization.username, authenticatedUser) ||
    !verified
  )
    throw new HttpError(401, "登录状态无效，请重新登录");

  if (request.method === "GET") {
    json(response, 200, {
      username: authenticatedUser,
      passwordMinimumLength: 12,
    });
    return;
  }
  if (request.method !== "POST") throw new HttpError(405, "请求方法不允许");
  if (!isTrustedWriteOrigin(request.headers))
    throw new HttpError(403, "拒绝跨站修改登录凭据");
  if (
    !String(request.headers["content-type"] || "").startsWith(
      "application/json",
    )
  )
    throw new HttpError(415, "仅接受 JSON 请求");

  const body = await readJson(request);
  const currentPassword = String(body.currentPassword || "");
  const newUsername = String(body.newUsername || "").trim();
  const newPassword = String(body.newPassword || "");
  if (!safeEqual(currentPassword, authorization.password))
    throw new HttpError(400, "当前密码不正确");
  const validationError = credentialValidationError({
    currentPassword,
    newUsername,
    newPassword,
  });
  if (validationError) throw new HttpError(400, validationError);

  try {
    await replaceCredentials(newUsername, newPassword);
  } catch {
    console.error("[yingji-auth] credential update failed");
    throw new HttpError(500, "登录凭据保存失败，请稍后重试");
  }
  json(response, 200, {
    username: newUsername,
    message: "登录账号和密码已更新",
  });
}

export function createAuthServer() {
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError ? error.message : "服务器暂时无法处理请求";
      json(response, status, { error: message });
    });
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 50;
  return server;
}

if (process.env.AUTH_SERVER_NO_LISTEN !== "1") {
  await fs.unlink(socketPath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  const server = createAuthServer();
  server.listen(socketPath, () => {
    void fs.chmod(socketPath, 0o660).catch(() => {
      console.error("[yingji-auth] unable to protect socket");
      process.exit(1);
    });
  });
}
