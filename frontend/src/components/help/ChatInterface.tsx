'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, ThumbsUp, ThumbsDown, Copy } from 'lucide-react';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: {
    route?: string;
    component?: string;
    action?: string;
  };
}

interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  context?: {
    route: string;
    component?: string;
  };
}

export function ChatInterface({ isOpen, onClose, context }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Add welcome message with context
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        type: 'assistant',
        content: getWelcomeMessage(context?.route),
        timestamp: new Date(),
        context,
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, context]);

  const getWelcomeMessage = (route?: string): string => {
    const routeMessages: Record<string, string> = {
      '/dashboard':
        'Hello! I can help you navigate your dashboard, track your progress, or answer questions about your learning journey. What would you like to know?',
      '/courses':
        'Welcome to the course catalog! I can help you find the right courses, explain different Web3 topics, or suggest learning paths. How can I assist you?',
      '/playground':
        'Ready to code? I can help you with coding challenges, explain concepts, or debug your code. What are you working on today?',
      '/simulator':
        "Let's explore blockchain together! I can guide you through simulations, explain transactions, or help you understand network behavior. What would you like to simulate?",
      '/certificates':
        'Congratulations on your progress! I can help you understand your certificates, share achievements, or plan your next steps. How can I help?',
    };

    return (
      routeMessages[route || ''] ||
      "Hello! I'm your AI learning assistant. I can help you with Web3 concepts, coding challenges, course navigation, or any questions about your learning journey. How can I assist you today?"
    );
  };

  const generateResponse = async (userMessage: string): Promise<string> => {
    // Simulate AI response generation
    // In a real implementation, this would call an AI service
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    const responses = [
      "That's a great question! Let me help you understand this concept better.",
      "I can definitely help you with that. Here's what you need to know...",
      'Excellent question! This is an important concept in Web3 development.',
      'Let me break this down for you step by step.',
      "I understand you're looking for help with this. Here's my guidance...",
    ];

    const contextualResponses: Record<string, string[]> = {
      '/dashboard': [
        'To track your progress, look at the progress bars in each course card.',
        'You can customize your dashboard by clicking the settings icon in the top right.',
        'Your study streak is displayed prominently - keep it going!',
      ],
      '/courses': [
        "I recommend starting with the 'Blockchain Fundamentals' course if you're new to Web3.",
        'You can filter courses by difficulty level using the dropdown menu.',
        'Each course has a detailed curriculum you can review before enrolling.',
      ],
      '/playground': [
        'Try starting with the basic smart contract template to get familiar with the syntax.',
        "You can run your code directly in the playground using the 'Run' button.",
        'The playground supports Solidity, JavaScript, and Rust for Web3 development.',
      ],
    };

    const routeContextual = contextualResponses[context?.route || ''];
    const allResponses = [...responses, ...(routeContextual || [])];

    return (
      allResponses[Math.floor(Math.random() * allResponses.length)] +
      "\n\nIs there anything specific about this topic you'd like me to explain further?"
    );
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
      context,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await generateResponse(inputValue);

      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        type: 'assistant',
        content: response,
        timestamp: new Date(),
        context,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to generate response:', error);

      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        type: 'assistant',
        content:
          'I apologize, but I encountered an error while processing your request. Please try again.',
        timestamp: new Date(),
        context,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFeedback = (messageId: string, type: 'up' | 'down') => {
    setFeedback((prev) => ({ ...prev, [messageId]: type }));
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bot className="h-6 w-6" />
                  <div>
                    <h3 className="text-lg font-semibold">AI Learning Assistant</h3>
                    <p className="text-sm opacity-90">
                      {context?.route ? `Help with ${context.route}` : 'Ask me anything!'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 transition-colors hover:bg-white/20"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="h-[400px] space-y-4 overflow-y-auto p-4">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl p-3 ${
                      message.type === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      <div className="mt-1 flex-shrink-0">
                        {message.type === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs opacity-70">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                          {message.type === 'assistant' && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => copyMessage(message.content)}
                                className="rounded p-1 transition-colors hover:bg-gray-200"
                                title="Copy message"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleFeedback(message.id, 'up')}
                                className={`rounded p-1 transition-colors ${
                                  feedback[message.id] === 'up'
                                    ? 'bg-green-200 text-green-600'
                                    : 'hover:bg-gray-200'
                                }`}
                                title="Helpful"
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleFeedback(message.id, 'down')}
                                className={`rounded p-1 transition-colors ${
                                  feedback[message.id] === 'down'
                                    ? 'bg-red-200 text-red-600'
                                    : 'hover:bg-gray-200'
                                }`}
                                title="Not helpful"
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="rounded-2xl bg-gray-100 p-3 text-gray-800">
                    <div className="flex items-center space-x-2">
                      <Bot className="h-4 w-4" />
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center space-x-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about Web3..."
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="rounded-lg bg-blue-500 p-2 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-gray-500">
                I'm here to help with Web3 concepts, coding, and navigation. Press Enter to send.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
