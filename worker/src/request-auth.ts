export async function validBearer(
  request: Request,
  secret?: string,
): Promise<boolean> {
  if (!secret) return false;
  const actual = request.headers.get("authorization") ?? "";
  const hash = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([hash(actual), hash(`Bearer ${secret}`)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
