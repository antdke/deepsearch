import ReactMarkdown, { type Components } from "react-markdown";
import type { Message } from "ai";

export type MessagePart = NonNullable<Message["parts"]>[number];

interface ChatMessageProps {
  parts?: MessagePart[];
  role: string;
  userName: string;
}

const components: Components = {
  // Override default elements with custom styling
  p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ className, children, ...props }) => (
    <code className={`${className ?? ""}`} {...props}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
      {children}
    </pre>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-blue-400 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

const Markdown = ({ children }: { children: string }) => {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
};

const renderMessagePart = (part: MessagePart, index: number) => {
  switch (part.type) {
    case "text":
      return <Markdown key={index}>{part.text}</Markdown>;

    case "tool-invocation":
      const { toolInvocation } = part;
      return (
        <div key={index} className="my-2 rounded bg-gray-700 p-3">
          <div className="text-xs font-semibold text-gray-400">
            Tool: {toolInvocation.toolName}
          </div>
          {toolInvocation.state === "partial-call" && (
            <div className="text-sm text-gray-300">
              <div className="text-xs text-gray-500">Status: Calling...</div>
              <pre className="mt-1 overflow-x-auto text-xs">
                {JSON.stringify(toolInvocation.args, null, 2)}
              </pre>
            </div>
          )}
          {toolInvocation.state === "call" && (
            <div className="text-sm text-gray-300">
              <div className="text-xs text-gray-500">Status: Called</div>
              <pre className="mt-1 overflow-x-auto text-xs">
                {JSON.stringify(toolInvocation.args, null, 2)}
              </pre>
            </div>
          )}
          {toolInvocation.state === "result" && (
            <div className="text-sm text-gray-300">
              <div className="text-xs text-gray-500">Status: Complete</div>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-gray-400">
                  View details
                </summary>
                <div className="mt-2">
                  <div className="text-xs text-gray-500">Arguments:</div>
                  <pre className="mt-1 overflow-x-auto text-xs">
                    {JSON.stringify(toolInvocation.args, null, 2)}
                  </pre>
                  <div className="mt-2 text-xs text-gray-500">Result:</div>
                  <pre className="mt-1 overflow-x-auto text-xs">
                    {JSON.stringify(toolInvocation.result, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </div>
      );

    case "reasoning":
      return (
        <div key={index} className="my-2 rounded bg-gray-700 p-3">
          <div className="text-xs font-semibold text-gray-400">Reasoning</div>
          <div className="mt-1 text-sm text-gray-300">{part.reasoning}</div>
        </div>
      );

    default:
      return null;
  }
};

export const ChatMessage = ({ parts, role, userName }: ChatMessageProps) => {
  const isAI = role === "assistant";

  return (
    <div>
      <div
        className={`rounded-lg p-4 ${
          isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
        }`}
      >
        <p className="mb-2 text-sm font-semibold text-gray-400">
          {isAI ? "AI" : userName}
        </p>

        <div className="prose prose-invert max-w-none">
          {parts?.map(renderMessagePart)}
        </div>
      </div>
    </div>
  );
};
