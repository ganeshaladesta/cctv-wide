import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export async function GET() {
  const store = getDataStore();
  return NextResponse.json(store.getStats());
}

