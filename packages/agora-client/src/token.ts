import type { AgoraTokenRequest, AgoraTokenResponse } from './types';

/** Request an Agora RTC token from the Edge Function */
export async function requestAgoraToken(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authToken: string,
  request: AgoraTokenRequest,
): Promise<AgoraTokenResponse> {
  const response = await fetch(`${supabaseUrl}/functions/v1/agora-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to get Agora token: ${error.message}`);
  }

  return response.json();
}
