"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Textarea, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  ProviderInfo,
  deleteConversation,
  fetchConversation,
  fetchConversations,
  fetchProviders,
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

export function ChatPanel() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("ollama");
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
    fetchProviders(controller.signal)
      .then((list) => {
        const languageProviders = list.filter((p) => p.capabilities.includes("language"));
        setProviders(languageProviders);
        const hasOllama = languageProviders.some((p) => p.provider === "ollama");
        const fallback = languageProviders[0]?.provider ?? "ollama";
        setSelectedProvider(hasOllama ? "ollama" : fallback);
      })
      .catch(() => {
        // provider list is non-critical; the picker falls back to Ollama
      });
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
      const { response, onEvent, consume } = await streamChat(
        inputText,
        activeIdRef.current ?? undefined,
        controller.signal,
        selectedProvider,
      );

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

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "New conversation";

  return (
    <div className="grid gap-5 lg:grid-cols-[290px_1fr]">
      <aside className="edge-light flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        <div className="border-b border-border p-3.5">
          <Button onClick={newChat} disabled={streaming} className="w-full">
            <PlusIcon className="h-4 w-4" />
            New conversation
          </Button>
        </div>

        <div aria-label="Conversation list" className="flex-1 space-y-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-3/4 rounded-xl" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-start gap-2 p-4">
              <p className="text-[13.5px] font-medium text-foreground">No conversations yet</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Your conversations are stored on the server and listed here across devices that share this
                client session.
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === activeId;
              const last = conversation.messages[0];
              return (
                <div
                  key={conversation.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void selectConversation(conversation.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void selectConversation(conversation.id);
                    }
                  }}
                  aria-current={active ? "true" : undefined}
                  className={`group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
                    active
                      ? "bg-primary-soft"
                      : "hover:bg-surface-2 focus-visible:bg-surface-2"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[13.5px] font-medium ${
                        active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {conversation.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                      {last ? `You · ${last.content.slice(0, 40)}` : "Empty conversation"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete conversation: ${conversation.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeConversation(conversation.id);
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-70 group-hover:hover:opacity-100"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <section className="edge-light flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary-soft text-primary">
              <ChatIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-foreground">{activeTitle}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {streaming
                  ? "Streaming a real response…"
                  : "Realtime chat with your configured providers"}
              </p>
            </div>
          </div>

          {streaming ? (
            <StatusChip tone="warning" label="Generating…" />
          ) : (
            <label className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Provider</span>
              <Select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                disabled={streaming}
                aria-label="AI provider"
                className="w-36"
              >
                {providers.length === 0 ? (
                  <option value="ollama">ollama</option>
                ) : (
                  providers.map((provider) => (
                    <option key={provider.provider} value={provider.provider}>
                      {provider.provider}
                    </option>
                  ))
                )}
              </Select>
            </label>
          )}
        </header>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 border-b border-danger/25 bg-danger/5 px-5 py-3"
          >
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : null}

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
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
            <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary-soft text-primary">
                <BotIcon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground">Start a conversation</p>
                <p className="mt-2 max-w-sm text-[13px] leading-6 text-muted-foreground">
                  Responses stream token-by-token from the local AI engine and every message is persisted to
                  PostgreSQL.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => <MessageBubble key={message.key} message={message} />)
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-border p-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={streaming}
            rows={3}
            aria-label="Message"
            placeholder={streaming ? "Waiting for the response…" : "Ask ISOBASH anything…"}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Enter to send · Shift+Enter for a new line · {conversations.length} conversation
              {conversations.length === 1 ? "" : "s"}
            </p>
            <Button type="submit" disabled={!input.trim() || streaming}>
              {streaming ? "Streaming…" : "Send"}
              <SendIcon className="h-3.5 w-3.5" />
            </Button>
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
        className={`max-w-[85%] px-4 py-3 text-[13.5px] leading-6 ${
          isUser
            ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-glow"
            : "edge-light rounded-2xl rounded-bl-md border border-border bg-surface-2 text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap">
          {message.content}
          {message.streaming ? (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-full bg-current align-middle"
            />
          ) : null}
        </p>
        {message.error ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
            <AlertTriangleIcon className="h-3.5 w-3.5" />
            {message.error}
          </p>
        ) : null}
        {!isUser && (message.model || message.provider) ? (
          <p className="mt-2 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            {message.provider} · {message.model}
          </p>
        ) : null}
      </div>
    </div>
  );
}
