import type { NextRequest } from 'next/server';

export async function POST(_request: NextRequest): Promise<Response> {
  const isProduction = process.env.NODE_ENV === 'production';

  const response = Response.json({ success: true });

  // Clear auth cookies
  response.headers.append(
    'Set-Cookie',
    `sb-access-token=; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}; HttpOnly`
  );
  response.headers.append(
    'Set-Cookie',
    `sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}; HttpOnly`
  );

  return response;
}
