import { Suspense } from "react";
import { WarRoom } from "@/components/war-room";

export default function Home() {
  return (
    <Suspense>
      <WarRoom />
    </Suspense>
  );
}
