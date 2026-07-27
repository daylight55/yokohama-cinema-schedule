import { inviteUser } from "../../_lib/accounts";
import type { AuthContextData, PagesEnv } from "../../_lib/env";

interface InviteRequest {
  email?: string;
}

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.data.authUser.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: InviteRequest;
  try {
    body = await context.request.json<InviteRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const email = await inviteUser(
      context.env.DB,
      body.email ?? "",
      context.data.userId,
    );
    return Response.json(
      { email },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }
};
