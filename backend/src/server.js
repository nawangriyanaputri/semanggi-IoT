const http = require("node:http");
const { routeRequest } = require("./routes");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.on("data", chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 10_000) {
        tooLarge = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Ukuran data terlalu besar."), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Format JSON tidak valid."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Key");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;
    const body = (request.method === "PUT" && pathname === "/api/settings") ||
      (request.method === "POST" && pathname === "/api/monitoring/readings")
      ? await readJsonBody(request)
      : undefined;
    const result = await routeRequest(
      request.method,
      pathname,
      body,
      url.searchParams,
      request.headers["x-device-key"]
    );
    if (result === undefined) {
      sendJson(response, 404, { error: "Endpoint tidak ditemukan." });
      return;
    }
    sendJson(response, 200, result);
  } catch (error) {
    console.error("API request failed:", error);
    const invalidSettings = error.message.includes("tidak valid") ||
      error.message.includes("harus berupa angka");
    const status = error.status || (invalidSettings ? 400 : 500);
    sendJson(response, status, {
      error: status < 500 ? error.message : "Terjadi kesalahan pada server."
    });
  }
});

server.listen(port, host, () => {
  console.log(`Backend API berjalan di http://${host}:${port}`);
});
