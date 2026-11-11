import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export async function GET() {
  const store = getDataStore();
  return NextResponse.json(store.getStats(), {
    headers: {
      "Cache-Control":
        "public, max-age=60, s-maxage=300, stale-while-revalidate=60"
    }
  });
}
