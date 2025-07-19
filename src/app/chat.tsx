"use client";

import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { useChat } from "@ai-sdk/react";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNewChatCreated } from "~/utils";
import type { Message } from "ai";
import { StickToBottom } from "use-stick-to-bottom";
import { ChatForm } from "~/components/chat-form.tsx";

interface ChatProps {
  userName: string;
  isAuthenticated: boolean;
  chatId: string;
  isNewChat: boolean;
  initialMessages?: Message[];
}

export const ChatPage = ({
  userName,
  isAuthenticated,
  chatId,
  isNewChat,
  initialMessages,
}: ChatProps) => {
  const [showSignInModal, setShowSignInModal] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, status, data } =
    useChat({ initialMessages, body: { chatId, isNewChat } });
  const isLoading = status === "submitted" || status === "streaming";

  const router = useRouter();
  useEffect(() => {
    const lastDataItem = data?.[data.length - 1];
    if (lastDataItem && isNewChatCreated(lastDataItem)) {
      router.push(`?chatId=${lastDataItem.chatId}`);
    }
  }, [data, router]);

  console.log(messages);

  return (
    <>
      <StickToBottom
        className="relative flex flex-1 flex-col [&>div:hover]:scrollbar-thumb-gray-500 [&>div]:scrollbar-thin [&>div]:scrollbar-track-gray-800 [&>div]:scrollbar-thumb-gray-600"
        resize="smooth"
        initial="smooth"
      >
        <StickToBottom.Content
          className="mx-auto flex w-full max-w-[65ch] flex-1 flex-col gap-6 p-4"
          role="log"
          aria-label="Chat messages"
        >
          {messages.map((message, index) => {
            return (
              <ChatMessage
                key={index}
                parts={message.parts}
                role={message.role}
                userName={userName}
              />
            );
          })}
          {status === "submitted" || status === "streaming" ? (
            <div>
              <div className="rounded-lg bg-gray-800 p-4 text-gray-300">
                <p className="mb-2 text-sm font-semibold text-gray-400">AI</p>
                <div className="flex items-center">
                  <Loader2 className="mr-2 size-5 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          ) : null}
        </StickToBottom.Content>

        <div className="border-t border-gray-700">
          <ChatForm
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            status={status}
            isAuthenticated={isAuthenticated}
            setShowSignInModal={setShowSignInModal}
          />
        </div>
      </StickToBottom>

      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
      />
    </>
  );
};
