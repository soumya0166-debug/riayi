'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { Conversation } from '@/types/conversation';
import { Message } from '@/types/message';
import { UserMemory, MemoryType, ConversationSummary } from '@/types/memory';
import { ResponseStyle, ExplanationLevel, TonePreference } from '@/types/preference';
import { StoredFile, KnowledgeIngestResult, SourceReference } from '@/types/attachment';
import { dbService } from '@/services/database/clientDb';
import { aiService } from '@/services/ai/aiService';
import { memoryService } from '@/services/memory/memoryService';
import { knowledgeService } from '@/services/knowledge/knowledgeService';
import { useAuth } from '@/features/auth/AuthContext';
import { DEFAULT_MODEL_ID } from '@/config/models';
import { generateId } from '@/lib/utils';
import { safeStorage } from '@/lib/storage';
import { STORAGE_KEYS, FILE_LIMITS } from '@/lib/constants';

export type GenerationStatus =
  | 'idle'
  | 'submitting'
  | 'streaming'
  | 'completed'
  | 'error'
  | 'cancelled';

interface ChatContextType {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: Message[];
  composerText: string;
  selectedModelId: string;
  isGenerating: boolean;
  generationStatus: GenerationStatus;
  activeAssistantMessageId: string | null;
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  searchQuery: string;
  isSettingsOpen: boolean;
  isAutomationOpen: boolean;
  isLoadingMessages: boolean;

  // Phase 3 & 6 Memory & Personalization state
  memories: UserMemory[];
  memoryEnabled: boolean;
  responseStyle: ResponseStyle;
  explanationLevel: ExplanationLevel;
  tone: TonePreference;
  customInstructions: string;
  memoryNotice: string | null;

  // Phase 4 File & Attachment state
  attachedFiles: StoredFile[];
  isUploadingFiles: boolean;
  uploadError: string | null;
  userFiles: StoredFile[];

  // Actions
  setComposerText: (text: string) => void;
  setSelectedModelId: (id: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsAutomationOpen: (open: boolean) => void;

  createNewConversation: (initialTitle?: string) => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  togglePinConversation: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopGeneration: () => void;
  retryMessage: (failedMessageId?: string) => Promise<void>;
  regenerateResponse: (assistantMessageId: string) => Promise<void>;
  populateComposer: (promptText: string) => void;
  clearCurrentConversation: () => Promise<void>;

  // Memory & Personalization Actions (Phase 3 & 6)
  refreshMemories: () => Promise<void>;
  toggleMemoryEnabled: () => Promise<void>;
  setResponseStyle: (style: ResponseStyle) => Promise<void>;
  setExplanationLevel: (level: ExplanationLevel) => Promise<void>;
  setTone: (tone: TonePreference) => Promise<void>;
  setCustomInstructions: (instructions: string) => Promise<void>;
  addMemory: (content: string, type?: MemoryType) => Promise<void>;
  editMemory: (id: string, newContent: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  clearAllMemories: () => Promise<void>;

  // File & Knowledge Actions (Phase 4)
  uploadFiles: (filesList: FileList | File[]) => Promise<StoredFile[]>;
  removeAttachment: (fileId: string) => void;
  clearAttachments: () => void;
  refreshUserFiles: () => Promise<void>;
  deleteUserFile: (fileId: string) => Promise<void>;
  renameUserFile: (fileId: string, newName: string) => Promise<void>;
}


const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const currentUserId = user?.id || 'guest_user_default';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composerText, setComposerText] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAutomationOpen, setIsAutomationOpen] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Phase 3 & 6 Memory and Personalization state
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [memoryEnabled, setMemoryEnabledState] = useState(true);
  const [responseStyle, setResponseStyleState] = useState<ResponseStyle>('balanced');
  const [explanationLevel, setExplanationLevelState] = useState<ExplanationLevel>('intermediate');
  const [tone, setToneState] = useState<TonePreference>('friendly');
  const [customInstructions, setCustomInstructionsState] = useState<string>('');
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);

  // Phase 4 File state
  const [attachedFiles, setAttachedFiles] = useState<StoredFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [userFiles, setUserFiles] = useState<StoredFile[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeMessageRef = useRef<Message | null>(null);

  const isGenerating = generationStatus === 'submitting' || generationStatus === 'streaming';

  // Load initial preferences, memories, and files
  const refreshMemories = useCallback(async () => {
    try {
      const list = await memoryService.getMemories(currentUserId);
      setMemories(list);
    } catch {
      setMemories([]);
    }
  }, [currentUserId]);

  const refreshUserFiles = useCallback(async () => {
    try {
      const list = await dbService.getFiles(currentUserId);
      setUserFiles(list);
    } catch {
      setUserFiles([]);
    }
  }, [currentUserId]);

  useEffect(() => {
    async function initPreferencesAndMemories() {
      try {
        const prefs = await dbService.getUserPreferences(currentUserId);
        setMemoryEnabledState(prefs.memoryEnabled);
        setResponseStyleState(prefs.responseStyle);
        if (prefs.explanationLevel) setExplanationLevelState(prefs.explanationLevel);
        if (prefs.tone) setToneState(prefs.tone);
        if (prefs.customInstructions) setCustomInstructionsState(prefs.customInstructions);
      } catch {
        // Fall back to defaults
      }
      await refreshMemories();
      await refreshUserFiles();
    }
    initPreferencesAndMemories();
  }, [currentUserId, refreshMemories, refreshUserFiles]);


  // Initialize stored conversations and sidebar state with user isolation
  useEffect(() => {
    async function initUserConversations() {
      const isCollapsed = safeStorage.get<boolean>(STORAGE_KEYS.SIDEBAR_COLLAPSED, false);
      setSidebarCollapsedState(isCollapsed);

      const list = await dbService.getConversations(currentUserId);
      setConversations(list);

      // Check user-partitioned active conversation ID first
      const userActiveKey = `${STORAGE_KEYS.ACTIVE_CONVERSATION_ID}_${currentUserId}`;
      let lastActiveId = safeStorage.get<string | null>(userActiveKey, null);

      if (!lastActiveId) {
        // Fallback to legacy key only if that conversation belongs to the user
        const legacyId = safeStorage.get<string | null>(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, null);
        if (legacyId && list.some((c) => c.id === legacyId)) {
          lastActiveId = legacyId;
        }
      }

      if (lastActiveId && list.some((c) => c.id === lastActiveId)) {
        setActiveConversationId(lastActiveId);
        await loadMessages(lastActiveId);
      } else if (list.length > 0) {
        // Default to most recent conversation if active ID is not set
        const first = list[0];
        setActiveConversationId(first.id);
        await loadMessages(first.id);
      } else {
        setActiveConversationId(null);
        setMessages([]);
      }
    }
    initUserConversations();
  }, [currentUserId]);

  const loadMessages = async (convId: string) => {
    setIsLoadingMessages(true);
    try {
      const msgs = await dbService.getMessages(convId);
      setMessages(msgs);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const setSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    safeStorage.set(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const createNewConversation = useCallback(
    async (initialTitle?: string): Promise<string> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const newConv = await dbService.createConversation({
        title: initialTitle || 'New Conversation',
        modelId: selectedModelId,
        userId: currentUserId,
      });
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      safeStorage.set(`${STORAGE_KEYS.ACTIVE_CONVERSATION_ID}_${currentUserId}`, newConv.id);
      safeStorage.set(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, newConv.id);
      setMessages([]);
      setGenerationStatus('idle');
      setActiveAssistantMessageId(null);
      setMobileDrawerOpen(false);
      return newConv.id;
    },
    [currentUserId, selectedModelId]
  );

  const selectConversation = useCallback(async (id: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveConversationId(id);
    safeStorage.set(`${STORAGE_KEYS.ACTIVE_CONVERSATION_ID}_${currentUserId}`, id);
    safeStorage.set(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, id);
    setGenerationStatus('idle');
    setActiveAssistantMessageId(null);
    await loadMessages(id);
    setMobileDrawerOpen(false);
  }, [currentUserId]);

  const renameConversation = useCallback(
    async (id: string, newTitle: string) => {
      const updated = await dbService.renameConversation(id, newTitle, currentUserId);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
    },
    [currentUserId]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (activeConversationId === id && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      await dbService.deleteConversation(id, currentUserId);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        safeStorage.remove(`${STORAGE_KEYS.ACTIVE_CONVERSATION_ID}_${currentUserId}`);
        safeStorage.remove(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
        setMessages([]);
        setGenerationStatus('idle');
      }
    },
    [activeConversationId, currentUserId]
  );

  const togglePinConversation = useCallback(async (id: string) => {
    const pinned = await dbService.togglePinConversation(id, currentUserId);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: pinned } : c))
    );
  }, [currentUserId]);

  const clearCurrentConversation = useCallback(async () => {
    if (activeConversationId) {
      await deleteConversation(activeConversationId);
    }
  }, [activeConversationId, deleteConversation]);

  const populateComposer = useCallback((promptText: string) => {
    setComposerText(promptText);
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setGenerationStatus('cancelled');
    if (activeMessageRef.current) {
      const finalMsg: Message = {
        ...activeMessageRef.current,
        metadata: {
          ...activeMessageRef.current.metadata,
          status: 'delivered',
        },
      };
      dbService.saveMessage(finalMsg);
      setMessages((prev) =>
        prev.map((m) => (m.id === finalMsg.id ? finalMsg : m))
      );
    }
    setActiveAssistantMessageId(null);
  }, []);

  // --- Memory Management Actions (Phase 3) ---

  const toggleMemoryEnabled = useCallback(async () => {
    const nextVal = !memoryEnabled;
    setMemoryEnabledState(nextVal);
    await dbService.updateUserPreferences(currentUserId, { memoryEnabled: nextVal });
  }, [currentUserId, memoryEnabled]);

  const setResponseStyle = useCallback(
    async (style: ResponseStyle) => {
      setResponseStyleState(style);
      await dbService.updateUserPreferences(currentUserId, { responseStyle: style });
    },
    [currentUserId]
  );

  const setExplanationLevel = useCallback(
    async (level: ExplanationLevel) => {
      setExplanationLevelState(level);
      await dbService.updateUserPreferences(currentUserId, { explanationLevel: level });
    },
    [currentUserId]
  );

  const setTone = useCallback(
    async (t: TonePreference) => {
      setToneState(t);
      await dbService.updateUserPreferences(currentUserId, { tone: t });
    },
    [currentUserId]
  );

  const setCustomInstructions = useCallback(
    async (instructions: string) => {
      setCustomInstructionsState(instructions);
      await dbService.updateUserPreferences(currentUserId, { customInstructions: instructions });
    },
    [currentUserId]
  );


  const addMemory = useCallback(
    async (content: string, type?: MemoryType) => {
      await memoryService.createMemory({
        userId: currentUserId,
        content,
        memoryType: type,
        importance: 4,
      });
      await refreshMemories();
    },
    [currentUserId, refreshMemories]
  );

  const editMemory = useCallback(
    async (id: string, newContent: string) => {
      await memoryService.updateMemory(id, currentUserId, { content: newContent });
      await refreshMemories();
    },
    [currentUserId, refreshMemories]
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      await memoryService.deleteMemory(id, currentUserId);
      await refreshMemories();
    },
    [currentUserId, refreshMemories]
  );

  const clearAllMemories = useCallback(async () => {
    await memoryService.clearMemories(currentUserId);
    setMemories([]);
  }, [currentUserId]);

  const showMemoryNotice = (notice: string) => {
    setMemoryNotice(notice);
    setTimeout(() => {
      setMemoryNotice(null);
    }, 4500);
  };

  // --- Phase 4 File & Knowledge Actions ---

  const uploadFiles = useCallback(
    async (filesList: FileList | File[]): Promise<StoredFile[]> => {
      const fileArray = Array.from(filesList);
      if (!fileArray.length) return [];

      setIsUploadingFiles(true);
      setUploadError(null);
      const uploaded: StoredFile[] = [];

      try {
        for (const file of fileArray) {
          if (file.size > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
            throw new Error(
              `"${file.name}" exceeds ${FILE_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB size limit.`
            );
          }

          const formData = new FormData();
          formData.append('file', file);
          formData.append('userId', currentUserId);
          if (activeConversationId) {
            formData.append('conversationId', activeConversationId);
          }

          const res = await fetch('/api/files/upload', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (errData.file) {
              await dbService.saveFile(errData.file);
              await refreshUserFiles();
            }
            throw new Error(errData.error || `Failed to process "${file.name}".`);
          }

          const data: KnowledgeIngestResult = await res.json();
          await dbService.saveFile(data.file);
          if (data.chunks && data.chunks.length > 0) {
            await dbService.saveChunks(data.chunks);
          }
          uploaded.push(data.file);
        }

        setAttachedFiles((prev) => [...prev, ...uploaded]);
        await refreshUserFiles();
        return uploaded;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error uploading file.';
        setUploadError(msg);
        return [];
      } finally {
        setIsUploadingFiles(false);
      }
    },
    [activeConversationId, currentUserId, refreshUserFiles]
  );

  const removeAttachment = useCallback((fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachedFiles([]);
    setUploadError(null);
  }, []);

  const deleteUserFile = useCallback(
    async (fileId: string) => {
      await knowledgeService.deleteKnowledge(fileId, currentUserId);
      setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
      await refreshUserFiles();
    },
    [currentUserId, refreshUserFiles]
  );

  const renameUserFile = useCallback(
    async (fileId: string, newName: string) => {
      await knowledgeService.renameDocument(fileId, currentUserId, newName);
      setAttachedFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f))
      );
      await refreshUserFiles();
    },
    [currentUserId, refreshUserFiles]
  );

  // --- Core Streaming & Memory + Document Intelligence Integration ---

  const executeStream = useCallback(
    async (convId: string, history: Message[], activeAttachments?: StoredFile[]) => {
      const assistantMessageId = generateId('msg_ast');
      const emptyAssistantMessage: Message = {
        id: assistantMessageId,
        conversationId: convId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        metadata: {
          model: selectedModelId,
          status: 'pending',
        },
      };

      activeMessageRef.current = emptyAssistantMessage;
      setActiveAssistantMessageId(assistantMessageId);
      setMessages((prev) => [...prev, emptyAssistantMessage]);
      setGenerationStatus('streaming');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulatedContent = '';
      let streamError: string | null = null;

      try {
        const latestUserMsg = history[history.length - 1];

        // Context-aware query expansion for pronouns and follow-up references
        const contextualQuery = latestUserMsg
          ? memoryService.resolveContextualQuery(latestUserMsg.content, history.slice(0, -1))
          : '';

        // 1. Retrieve relevant memories with context-aware query
        let relevantMemories: UserMemory[] = [];
        if (memoryEnabled && latestUserMsg) {
          try {
            relevantMemories = await memoryService.getRelevantMemories(
              currentUserId,
              contextualQuery || latestUserMsg.content,
              4
            );
          } catch {
            relevantMemories = [];
          }
        }

        // 2. Retrieve Document Intelligence Chunks & Sources with context-aware query
        let relevantChunks: any[] = [];
        let sources: SourceReference[] = [];

        if (latestUserMsg) {
          try {
            const historyFileIds = history.flatMap((m) => m.attachments || []).map((a) => a.id);
            const currentFileIds = (activeAttachments || []).map((a) => a.id);
            const targetFileIds = Array.from(new Set([...currentFileIds, ...historyFileIds]));

            const searchResults = await knowledgeService.getRelevantChunks(
              currentUserId,
              contextualQuery || latestUserMsg.content,
              targetFileIds.length > 0 ? targetFileIds : undefined,
              4
            );

            if (searchResults.length > 0) {
              relevantChunks = searchResults.map((r) => r.chunk);
              const formatted = knowledgeService.formatChunksForContext(searchResults);
              sources = formatted.sources;
            }
          } catch {
            relevantChunks = [];
            sources = [];
          }
        }

        // 3. Retrieve or generate conversation summary for long chats
        let convSummary: ConversationSummary | null = null;
        if (history.length >= 6) {
          try {
            convSummary = await dbService.getConversationSummary(convId);
            if (memoryService.shouldRefreshSummary(convSummary, history.length)) {
              convSummary = await memoryService.summarizeConversation(
                convId,
                history,
                currentUserId
              );
            }
          } catch {
            convSummary = null;
          }
        }

        let currentPrefs = null;
        try {
          currentPrefs = await dbService.getUserPreferences(currentUserId);
        } catch {
          currentPrefs = null;
        }


        // Sanitize history sent to server: filter out empty assistant placeholders
        const sanitizedHistory = history.filter(
          (m) =>
            (typeof m.content === 'string' && m.content.trim().length > 0) ||
            (Array.isArray(m.attachments) && m.attachments.length > 0)
        );

        const chunkStream = aiService.streamMessage(sanitizedHistory, {
          conversationId: convId,
          modelId: selectedModelId,
          signal: controller.signal,
          relevantMemories,
          conversationSummary: convSummary,
          userPreferences: currentPrefs,
          relevantChunks,
          attachedFiles: activeAttachments,
        });

        const activeModelName = 'gemini';
        const activeProviderName = 'gemini';

        for await (const chunk of chunkStream) {
          if (controller.signal.aborted) {
            break;
          }

          if (chunk.error) {
            streamError = chunk.error;
            break;
          }

          if (chunk.delta) {
            accumulatedContent += chunk.delta;
            const updatedAssistant: Message = {
              ...emptyAssistantMessage,
              content: accumulatedContent,
              metadata: {
                model: activeModelName,
                provider: activeProviderName,
                status: 'pending',
                sources: sources.length > 0 ? sources : undefined,
              },
            };
            activeMessageRef.current = updatedAssistant;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessageId ? updatedAssistant : m))
            );
          }
        }

        if (controller.signal.aborted) {
          setGenerationStatus('cancelled');
          const cancelledMsg: Message = {
            ...emptyAssistantMessage,
            content: accumulatedContent,
            metadata: {
              model: activeModelName,
              provider: activeProviderName,
              status: 'delivered',
              sources: sources.length > 0 ? sources : undefined,
            },
          };
          await dbService.saveMessage(cancelledMsg);
          return;
        }

        if (streamError) {
          setGenerationStatus('error');
          const errorMsg: Message = {
            ...emptyAssistantMessage,
            content: accumulatedContent,
            metadata: {
              model: activeModelName,
              provider: activeProviderName,
              status: 'error',
              errorMessage: streamError,
              sources: sources.length > 0 ? sources : undefined,
            },
          };
          await dbService.saveMessage(errorMsg);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? errorMsg : m))
          );
          return;
        }

        // Successfully Completed
        setGenerationStatus('completed');
        const completedMsg: Message = {
          ...emptyAssistantMessage,
          content: accumulatedContent,
          metadata: {
            model: activeModelName,
            provider: activeProviderName,
            status: 'delivered',
            sources: sources.length > 0 ? sources : undefined,
          },
        };
        await dbService.saveMessage(completedMsg);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? completedMsg : m))
        );

        // Update conversation summary in background for long chats
        if (history.length >= 6) {
          memoryService
            .summarizeConversation(convId, [...history, completedMsg], currentUserId)
            .catch(() => {});
        }

        // Update conversation title if this is the first turn
        const currentConv = conversations.find((c) => c.id === convId);
        if (currentConv && (!currentConv.title || currentConv.title === 'New Conversation')) {
          const firstUserMsg = history.find((m) => m.role === 'user');
          if (firstUserMsg) {
            const title = await aiService.generateTitle(firstUserMsg.content);
            await dbService.updateConversation(convId, { title });
            setConversations((prev) =>
              prev.map((c) => (c.id === convId ? { ...c, title } : c))
            );
          }
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          setGenerationStatus('error');
          const errMsg: Message = {
            ...emptyAssistantMessage,
            content: accumulatedContent,
            metadata: {
              model: selectedModelId,
              status: 'error',
              errorMessage: 'An unexpected connection error occurred.',
            },
          };
          await dbService.saveMessage(errMsg);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? errMsg : m))
          );
        }
      } finally {
        abortControllerRef.current = null;
        activeMessageRef.current = null;
        setActiveAssistantMessageId(null);
      }
    },
    [conversations, currentUserId, memoryEnabled, selectedModelId]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const currentAttached = [...attachedFiles];
      if ((!trimmed && currentAttached.length === 0) || isGenerating) return;

      let convId = activeConversationId;
      if (!convId) {
        convId = await createNewConversation();
      }

      setGenerationStatus('submitting');
      setComposerText('');
      setAttachedFiles([]); // Clear composer attachments

      // 1. Check for Explicit Memory Commands ("Remember that...", "Forget that...", "What do you remember?")
      const explicitCommand = await memoryService.parseExplicitCommand(trimmed, currentUserId);
      if (explicitCommand.isCommand) {
        const userMsg: Message = {
          id: generateId('msg_user'),
          conversationId: convId,
          role: 'user',
          content: trimmed,
          createdAt: new Date().toISOString(),
          attachments: currentAttached.length > 0 ? currentAttached : undefined,
          metadata: { model: selectedModelId, status: 'delivered' },
        };
        await dbService.saveMessage(userMsg);

        const assistantMsg: Message = {
          id: generateId('msg_ast'),
          conversationId: convId,
          role: 'assistant',
          content: explicitCommand.feedbackMessage || 'Memory updated.',
          createdAt: new Date().toISOString(),
          metadata: { model: selectedModelId, status: 'delivered' },
        };
        await dbService.saveMessage(assistantMsg);

        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setGenerationStatus('completed');

        await refreshMemories();
        if (explicitCommand.action === 'remember') {
          showMemoryNotice('RIYAI remembered this preference.');
        }
        return;
      }

      // 2. Evaluate if message should automatically become a candidate memory (Layer 2)
      if (memoryEnabled && trimmed) {
        const candidate = memoryService.shouldRemember(trimmed);
        if (candidate.shouldRemember && candidate.content) {
          memoryService
            .createMemory({
              userId: currentUserId,
              content: candidate.content,
              memoryType: candidate.memoryType,
              importance: candidate.importance,
              sourceConversationId: convId,
            })
            .then(() => {
              refreshMemories();
              showMemoryNotice('RIYAI remembered this preference.');
            })
            .catch(() => {});
        }
      }

      // 3. Normal LLM Conversation flow with Memory Context and File Attachments
      // Clean existing messages: filter out any empty assistant placeholders or failed turns with no content
      const cleanHistory = messages.filter(
        (m) =>
          m.role === 'user' ||
          (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0)
      );

      const userMessage: Message = {
        id: generateId('msg_user'),
        conversationId: convId,
        role: 'user',
        content: trimmed || `[Attached ${currentAttached.map((a) => a.name).join(', ')}]`,
        createdAt: new Date().toISOString(),
        attachments: currentAttached.length > 0 ? currentAttached : undefined,
        metadata: {
          model: selectedModelId,
          status: 'delivered',
        },
      };

      await dbService.saveMessage(userMessage);
      const updatedMessages = [...cleanHistory, userMessage];
      setMessages(updatedMessages);

      // Refresh sidebar list
      const updatedList = await dbService.getConversations(currentUserId);
      setConversations(updatedList);

      // Begin real streaming execution with memory + document intelligence
      await executeStream(convId, updatedMessages, currentAttached);
    },
    [
      activeConversationId,
      attachedFiles,
      createNewConversation,
      currentUserId,
      executeStream,
      isGenerating,
      memoryEnabled,
      messages,
      refreshMemories,
      selectedModelId,
    ]
  );

  const retryMessage = useCallback(
    async (failedMessageId?: string) => {
      if (isGenerating || !activeConversationId) return;

      let historyToKeep = [...messages];

      if (failedMessageId) {
        const index = historyToKeep.findIndex((m) => m.id === failedMessageId);
        if (index !== -1) {
          historyToKeep = historyToKeep.slice(0, index);
        }
      } else {
        while (
          historyToKeep.length > 0 &&
          (historyToKeep[historyToKeep.length - 1].role === 'assistant' ||
            historyToKeep[historyToKeep.length - 1].content.trim().length === 0)
        ) {
          historyToKeep.pop();
        }
      }

      historyToKeep = historyToKeep.filter(
        (m) =>
          m.role === 'user' ||
          (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0)
      );

      setMessages(historyToKeep);
      await executeStream(activeConversationId, historyToKeep);
    },
    [activeConversationId, executeStream, isGenerating, messages]
  );

  const regenerateResponse = useCallback(
    async (assistantMessageId: string) => {
      if (isGenerating || !activeConversationId) return;

      const targetIndex = messages.findIndex((m) => m.id === assistantMessageId);
      if (targetIndex === -1) return;

      let historyToKeep = messages.slice(0, targetIndex);
      historyToKeep = historyToKeep.filter(
        (m) =>
          m.role === 'user' ||
          (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0)
      );
      setMessages(historyToKeep);
      await executeStream(activeConversationId, historyToKeep);
    },
    [activeConversationId, executeStream, isGenerating, messages]
  );

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || null;

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        activeConversation,
        messages,
        composerText,
        selectedModelId,
        isGenerating,
        generationStatus,
        activeAssistantMessageId,
        sidebarCollapsed,
        mobileDrawerOpen,
        searchQuery,
        isSettingsOpen,
        isLoadingMessages,
        memories,
        memoryEnabled,
        responseStyle,
        explanationLevel,
        tone,
        customInstructions,
        memoryNotice,
        setComposerText,
        setSelectedModelId,
        setSidebarCollapsed,
        toggleSidebar,
        setMobileDrawerOpen,
        setSearchQuery,
        setIsSettingsOpen,
        isAutomationOpen,
        setIsAutomationOpen,
        createNewConversation,
        selectConversation,
        renameConversation,
        deleteConversation,
        togglePinConversation,
        sendMessage,
        stopGeneration,
        retryMessage,
        regenerateResponse,
        populateComposer,
        clearCurrentConversation,
        refreshMemories,
        toggleMemoryEnabled,
        setResponseStyle,
        setExplanationLevel,
        setTone,
        setCustomInstructions,
        addMemory,
        editMemory,
        deleteMemory,
        clearAllMemories,
        attachedFiles,
        isUploadingFiles,
        uploadError,
        userFiles,
        uploadFiles,
        removeAttachment,
        clearAttachments,
        refreshUserFiles,
        deleteUserFile,
        renameUserFile,
      }}

    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
