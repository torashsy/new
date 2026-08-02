import { redirect } from "next/navigation";
import { currentUserId } from "./session";
import { getUser } from "./queries";
import type { User } from "./types";

/**
 * いま見ている本人。
 *
 * next/headers に依存するのはこのモジュールだけにして、
 * lib/queries.ts は userId を受け取るだけの純粋な関数にしてある
 * （テストから Next のランタイムなしで呼べるようにするため）。
 */

/** ログインしていなければ /signin に飛ばす。 */
export async function requireViewer(): Promise<User> {
  const id = await currentUserId();
  if (!id) redirect("/signin");

  const user = await getUser(id);
  // 署名は有効だがユーザーが消えている（データを作り直した後など）。
  // ページの描画中はクッキーを触れないので、消さずに追い返すだけにする。
  // /signin 側も「id があること」ではなく「ユーザーが実在すること」で判定するので、
  // ここで消さなくても往復ループにはならない。
  if (!user) redirect("/signin");
  return user;
}

/** ログインしていなくても落ちない版。 */
export async function optionalViewer(): Promise<User | null> {
  const id = await currentUserId();
  return id ? getUser(id) : null;
}
