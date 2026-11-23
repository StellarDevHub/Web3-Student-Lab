import prisma from '../db/index.js';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';

export function buildDiscordAuthorizationUrl(state: string, challenge: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error('Discord OAuth is not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

export async function linkDiscordAccount(
  studentId: string,
  code: string,
  verifier: string
): Promise<{ id: string; username: string }> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Discord OAuth is not configured');
  }

  const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error('Discord OAuth code exchange failed');
  }

  const token = (await tokenResponse.json()) as { access_token?: string; token_type?: string };
  if (!token.access_token) throw new Error('Discord did not return an access token');

  const userResponse = await fetch(DISCORD_USER_URL, {
    headers: { Authorization: `${token.token_type || 'Bearer'} ${token.access_token}` },
  });
  if (!userResponse.ok) throw new Error('Failed to fetch Discord identity');
  const user = (await userResponse.json()) as { id?: string; username?: string; global_name?: string };
  if (!user.id || !user.username) throw new Error('Discord returned an invalid identity');

  const existing = await prisma.student.findUnique({ where: { discordId: user.id }, select: { id: true } });
  if (existing && existing.id !== studentId) {
    throw new Error('This Discord account is already linked to another profile');
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { discordId: user.id, discordUsername: user.global_name || user.username },
  });

  return { id: user.id, username: user.global_name || user.username };
}
