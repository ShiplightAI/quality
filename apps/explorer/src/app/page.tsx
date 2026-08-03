import { redirect } from "next/navigation";

export default function HomePage(): never {
  redirect("/quality-explorer");
}
