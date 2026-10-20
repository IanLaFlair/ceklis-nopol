import { PetugasSession } from "@/components/petugas/session";

export default function PetugasLayout({ children }: { children: React.ReactNode }) {
  return <PetugasSession>{children}</PetugasSession>;
}
