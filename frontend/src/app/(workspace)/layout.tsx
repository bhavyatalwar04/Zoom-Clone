import { TopNav } from "@/components/layout/TopNav";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <TopNav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
