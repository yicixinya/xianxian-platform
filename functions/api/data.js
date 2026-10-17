// Cloudflare Pages Function：平台共享数据中间层
// 浏览器调用 /api/data，本函数用环境变量里的 GitHub 令牌读写
// yicixinya/xianxian-platform 仓库里的 data.json，实现多用户共享数据。
// 令牌不进网页、不被 GitHub 密钥扫描拦截。

const OWNER = "yicixinya";
const REPO = "xianxian-platform";
const BRANCH = "main";
const PATH = "data.json";
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
const ghH = (token, extra) => Object.assign({
  "Authorization": `Bearer ${token}`,
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
}, extra || {});
const b64enc = (str) => btoa(unescape(encodeURIComponent(str)));
const b64dec = (b64) => decodeURIComponent(escape(atob((b64 || "").replace(/\s/g, ""))));
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const jresp = (obj, status) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
});

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  const token = env.GITHUB_TOKEN;
  if (!token) return jresp({ error: "GITHUB_TOKEN 未设置" }, 500);
  try {
    const r = await fetch(`${API}?ref=${BRANCH}`, { headers: ghH(token) });
    if (r.status === 404) return jresp({ accounts: [], projects: [] }, 200);
    if (!r.ok) return jresp({ error: "github " + r.status }, 502);
    const j = await r.json();
    const data = JSON.parse(b64dec(j.content));
    return jresp(data, 200);
  } catch (e) { return jresp({ error: String(e) }, 500); }
}

export async function onRequestPut({ request, env }) {
  const token = env.GITHUB_TOKEN;
  if (!token) return jresp({ error: "GITHUB_TOKEN 未设置" }, 500);
  try {
    const body = await request.text();
    JSON.parse(body); // 校验 JSON
    // 取当前 sha（避免覆盖）
    let sha = null;
    const gr = await fetch(`${API}?ref=${BRANCH}`, { headers: ghH(token) });
    if (gr.ok) { const gj = await gr.json(); sha = gj.sha; }
    const pr = await fetch(API, {
      method: "PUT",
      headers: ghH(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "update platform data", content: b64enc(body), sha, branch: BRANCH })
    });
    if (pr.status === 409) return jresp({ error: "数据已被他人更新，请刷新" }, 409);
    if (!pr.ok) return jresp({ error: "github put " + pr.status }, 502);
    return jresp({ ok: true }, 200);
  } catch (e) { return jresp({ error: String(e) }, 500); }
}
