/**
 * One-time Google Health sign-in. Prints a refresh token to paste into .env.local.
 *
 *   npm run google:auth
 *
 * Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from a *Desktop app* OAuth client, in a
 * Google Cloud project with the Google Health API enabled and your account added as a test user.
 */
import crypto from "node:crypto";
import http from "node:http";
import { SCOPES } from "../lib/googleHealth";

const PORT = 8765;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
if (!GOOGLE_CLIENT_ID) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.");
  process.exit(1);
}

const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: GOOGLE_CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: SCOPES.join(" "),
  access_type: "offline",
  prompt: "consent",
  code_challenge: challenge,
  code_challenge_method: "S256",
  // Deliberately NOT include_granted_scopes: mixed legacy scopes break the Google Health API.
}).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  const code = url.searchParams.get("code");
  if (!code) {
    res.end("Waiting for Google...");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET ?? "",
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    }),
  });
  const json = await tokenRes.json();
  if (!tokenRes.ok || !json.refresh_token) {
    res.end("Token exchange failed, see terminal.");
    console.error(json);
    process.exit(1);
  }
  res.end("Done! You can close this tab.");
  console.log("\nAdd this line to .env.local:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${json.refresh_token}\n`);
  server.close();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this URL and sign in with the watch owner's Google account:\n");
  console.log(authUrl.toString());
});
