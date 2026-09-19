"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  BotIcon,
  ChatIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  ConversationItem,
  MessageItem,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  streamChat,
} from "@/lib/api";

type LocalMessage = {
  key: string;
  id?: string;
  role: "user" | "assistant";
  content: string;
  error?: string | null;
  model?: string | null;
  provider?: string | null;
  streaming?: boolean;
  pending?: boolean;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const quietReload = useCallback(async () => {
    try {
      const list = await fetchConversations();
      setConversations(list);
    } catch {
      // keep the current list; errors surface through the active view
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchConversations(controller.signal)
      .then((list) => setConversations(list))
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load conversations.");
      })
      .finally(() => setLoadingList(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, loadingThread]);

  const selectConversation = async (id: string) => {
    if (streaming || id === activeId) return;
    setActiveId(id);
    setMessages([]);
    setLoadingThread(true);
    setError(null);
    const controller = new AbortController();
    try {
      const detail = await fetchConversation(id, controller.signal);
      const items = detail.messages.map((m: MessageItem): LocalMessage => ({
        key: m.id,
        id: m.id,
        role: m.role,
        content: m.content,
        error: m.error,
        model: m.model,
        provider: m.provider,
      }));
      setMessages(items);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not load this conversation.");
    } finally {
      setLoadingThread(false);
    }
  };

  const newChat = () => {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setError(null);
  };

  const removeConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      await quietReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the conversation.");
    }
  };

  const send = async (rawInput: string) => {
    const inputText = rawInput.trim();
    if (!inputText || streaming) return;

    const controller = new AbortController();
    const userKey = `u-${Date.now()}`;
    const assistantKey = `a-${Date.now()}`;

    setStreaming(true);
    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { key: userKey, role: "user", content: inputText, pending: true },
      { key: assistantKey, role: "assistant", content: "", streaming: true, pending: true },
    ]);

    const finalize = (patch: Partial<LocalMessage>) => {
      setMessages((prev) => prev.map((m) => (m.key === assistantKey ? { ...m, ...patch } : m)));
    };

    const patchUser = (patch: Partial<LocalMessage>) => {
      setMessages((prev) => prev.map((m) => (m.key === userKey ? { ...m, ...patch } : m)));
    };

    try {
      const { response, onEvent, consume } = await streamChat(inputText, activeIdRef.current ?? undefined, controller.signal);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? `Request failed (${response.status})`);
        setMessages((prev) => prev.filter((m) => m.pending));
        return;
      }

      onEvent((event) => {
        if (event.type === "meta") {
          setActiveId(event.conversationId);
          patchUser({ id: event.userMessageId, pending: false });
          setConversations((prev) => {
            const existing = prev.some((c) => c.id === event.conversationId);
            if (existing) return prev;
            return [
              {
                id: event.conversationId,
                title: event.conversationTitle,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: [{ role: "user", content: inputText, createdAt: new Date().toISOString() }],
              },
              ...prev,
            ];
          });
        } else if (event.type === "delta") {
          setMessages((prev) =>
            prev.map((m) => (m.key === assistantKey ? { ...m, content: m.content + event.text } : m)),
          );
        } else if (event.type === "done") {
          finalize({
            id: event.messageId,
            provider: event.provider,
            model: event.model,
            streaming: false,
            pending: false,
          });
        } else if (event.type === "error") {
          setError(event.message);
          finalize({ id: event.messageId, error: event.message, streaming: false, pending: false });
        }
      });

      await consume();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Generation failed.";
      setError(message);
      finalize({ error: message, streaming: false, pending: false });
    } finally {
      setMessages((prev) => prev.map((m) => (m.pending ? { ...m, pending: false } : m)));
      setStreaming(false);
      void quietReload();
    }
  };

  const isStreaming = streaming;

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="flex min-h-[24rem] flex-col rounded-2xl border border-foreground/10 bg-surface">
        <div className="border-b border-foreground/10 p-4">
          <button
            onClick={newChat}
            disabled={isStreaming}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            New conversation
          </button>
        </div>

        <div aria-label="Conversation list" className="flex-1 space-y-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-3/4" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-start gap-2 p-4">
              <p className="text-sm font-medium text-foreground">No conversations yet</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Your conversations are stored on the server and listed here across devices that share this client session.
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === activeId;
              const last = conversation.messages[0];
              return (
                <div
                  key={conversation.id}
                  className={`group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
                    active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  }`}
                  onClick={() => void selectConversation(conversation.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{conversation.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {last ? `You · ${last.content.slice(0, 40)}` : "Empty conversation"}
                    </p>
                  </div>
                  <button
                    aria-label="Delete conversation"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeConversation(conversation.id);
                    }}
                    className="invisible rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-danger group-hover:visible"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-foreground/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ChatIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {conversations.find((c) => c.id === activeId)?.title ?? "New conversation"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isStreaming ? "Streaming a real response…" : "Realtime chat with your configured providers"}
              </p>
            </div>
          </div>
          {isStreaming ? (
            <StatusChip tone="warning" label="Generating…" />
          ) : (
            <Badge tone="neutral">Local provider · Ollama</Badge>
          )}
        </header>

        {error ? (
          <div className="flex items-start gap-3 border-b border-danger/25 bg-danger/5 px-5 py-3">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : null}

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {loadingThread ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Skeleton className="h-12 w-2/3 rounded-2xl" />
              </div>
              <div className="flex justify-start">
                <Skeleton className="h-16 w-2/3 rounded-2xl" />
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BotIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Start a conversation</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  Responses stream token-by-token from the local AI engine and every message is persisted to PostgreSQL.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.key} message={message} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-foreground/10 p-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={isStreaming}
            rows={3}
            placeholder={isStreaming ? "Waiting for the response…" : "Ask ISOBASH anything…"}
            className="w-full resize-none rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Enter to send · Shift+Enter for a new line · {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
            </p>
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
            >
              {isStreaming ? "Streaming…" : "Send"}
              <SendIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-foreground/10 bg-background"
        }`}
      >
        <p className="whitespace-pre-wrap text-foreground">
          {message.content}
          {message.streaming ? <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-full bg-current align-middle" /> : null}
        </p>
        {message.error ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
            <AlertTriangleIcon className="h-3.5 w-3.5" />
            {message.error}
          </p>
        ) : null}
        {!isUser && (message.model || message.provider) ? (
          <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            {message.provider} · {message.model}
          </p>
        ) : null}
      </div>
    </div>
  );
}