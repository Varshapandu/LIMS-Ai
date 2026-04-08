"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { loadStoredUser } from "../lib/auth-storage";
import { processChatbotMessage } from "../lib/chatbot-agent";
import { chatbotMenuTree, findChatMenuNode, type ChatMenuNode } from "../lib/chatbot-menu";

type Message = {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "assistant",
      content:
        "Hello! I'm your workflow assistant. I can answer LIMS questions about billing, workflow, payment details, results, and reports. You can type freely or use the guided buttons to open topic menus and sub-questions.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [menuPath, setMenuPath] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSendMessage(content: string) {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    window.setTimeout(() => {
      const storedUser = loadStoredUser();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: processChatbotMessage(content, {
          name: storedUser?.name,
          role: storedUser?.role,
        }).content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 300);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handleSendMessage(inputValue);
  }

  const currentMenu = findChatMenuNode(chatbotMenuTree, menuPath);
  const visibleOptions: ChatMenuNode[] = currentMenu?.children || chatbotMenuTree;
  const menuTitle = currentMenu ? currentMenu.label : "Guided topics";

  function handleMenuSelection(option: ChatMenuNode) {
    if (option.children?.length) {
      setMenuPath((prev) => [...prev, option.id]);
      return;
    }

    if (option.prompt) {
      handleSendMessage(option.prompt);
    }
  }

  return (
    <>
      <button
        className="chat-bubble-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open chat assistant"
        title="LIMS AI Assistant"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="chat-status-dot" />
      </button>

      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <div className="chat-header-title">
              <div className="chat-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" fill="#17a4a9" />
                  <path d="M12 7C10.9 7 10 7.9 10 9C10 10.1 10.9 11 12 11C13.1 11 14 10.1 14 9C14 7.9 13.1 7 12 7ZM12 13C9.67 13 5.5 14.16 5.5 16.5V19H18.5V16.5C18.5 14.16 14.33 13 12 13Z" fill="white" />
                </svg>
              </div>
              <div>
                <div className="chat-title">LIMS AI Assistant</div>
                <div className="chat-status-indicator">Online</div>
              </div>
            </div>
            <button className="chat-close-button" onClick={() => setIsOpen(false)} aria-label="Close chat">
              ×
            </button>
          </div>

          <div className="chat-messages">
            {messages.map((message) => (
              <div key={message.id} className={`chat-message chat-message-${message.type}`}>
                <div className="chat-message-content">{message.content}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-suggestions">
            <div className="chat-suggestions-header">
              <div className="suggestions-title">{menuTitle}</div>
              <div className="chat-menu-actions">
                {menuPath.length > 0 && (
                  <button
                    type="button"
                    className="chat-menu-link"
                    onClick={() => setMenuPath((prev) => prev.slice(0, -1))}
                  >
                    Back
                  </button>
                )}
                {menuPath.length > 0 && (
                  <button
                    type="button"
                    className="chat-menu-link"
                    onClick={() => setMenuPath([])}
                  >
                    Main menu
                  </button>
                )}
              </div>
            </div>
            <div className="suggestions-grid">
              {visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="suggestion-button"
                  onClick={() => handleMenuSelection(option)}
                >
                  <span>{option.label}</span>
                  <small>{option.description || (option.children?.length ? "Open sub-questions" : "Ask this question")}</small>
                </button>
              ))}
            </div>
          </div>

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask or instruct: retest, collect, enter result..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
            />
            <button
              className="chat-send-button"
              type="submit"
              disabled={isLoading}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 20.5v-18L21 11 3 20.5z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
