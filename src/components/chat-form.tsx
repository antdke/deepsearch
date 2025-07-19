"use client";

import { useStickToBottomContext } from "use-stick-to-bottom";
import { Loader2 } from "lucide-react";

import type { Dispatch, SetStateAction } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";

type HandleInputChange = UseChatHelpers["handleInputChange"];
type HandleSubmit = UseChatHelpers["handleSubmit"];
type Status = UseChatHelpers["status"];

interface ChatFormProps {
  input: string;
  handleInputChange: HandleInputChange;
  handleSubmit: HandleSubmit;
  status: Status;
  isAuthenticated: boolean;
  setShowSignInModal: Dispatch<SetStateAction<boolean>>;
}

export function ChatForm({
  input,
  handleInputChange,
  handleSubmit: parentHandleSubmit,
  status,
  isAuthenticated,
  setShowSignInModal,
}: ChatFormProps) {
  const { scrollToBottom } = useStickToBottomContext();

  const isLoading = status === "submitted" || status === "streaming";

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isAuthenticated) {
      setShowSignInModal(true);
      return;
    }

    parentHandleSubmit(e);
    scrollToBottom();
  };

  return (
    <form onSubmit={handleFormSubmit} className="mx-auto max-w-[65ch] p-4">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Say something..."
          autoFocus
          aria-label="Chat input"
          className="flex-1 rounded border border-gray-700 bg-gray-800 p-2 text-gray-200 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          disabled={status !== "ready"}
        />
        <button
          type="submit"
          disabled={status !== "ready"}
          className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:hover:bg-gray-700"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Send"}
        </button>
      </div>
    </form>
  );
}
