import { MessageCircle } from "lucide-react";
import Link from "next/link";

export default function TeamChatPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zoom-blue-soft">
        <MessageCircle className="h-8 w-8 text-zoom-blue" />
      </span>
      <h1 className="mt-5 text-xl font-bold">Team Chat</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Persistent team chat is outside the scope of this clone. In-meeting chat is available inside every meeting.
      </p>
      <Link href="/" className="mt-6 text-sm font-bold text-zoom-blue hover:underline">
        Back to Home
      </Link>
    </div>
  );
}
