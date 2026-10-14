# RIYAI — Your Intelligent Companion

RIYAI is an original, production-quality personal AI assistant platform built for clarity, depth, and fluid interaction.

> **Status: Phase 3 Complete (Multimodal Document Intelligence, RAG & Long-Term Memory)**  
> Phase 3 elevates RIYAI with an end-to-end multimodal document processing pipeline and persistent long-term memory engine. Users can attach PDFs, Word documents, spreadsheets, code files, and images via drag-and-drop or file picker. Extracted documents are semantically chunked and indexed with local RAG retrieval and source citations. A personalized memory service captures user preferences, facts, and project contexts across conversations, injecting relevant memory into model prompts while respecting user privacy and toggle controls.

---

## Phase 3 Architecture & Capabilities

```
RIYAI/
├── app/
│   ├── api/
│   │   ├── chat/route.ts         # SSE streaming with Memory + RAG context injection
│   │   ├── files/upload/route.ts # Multipart upload, MIME validation & extraction
│   │   ├── files/[id]/route.ts   # File download / content retrieval
│   │   └── health/route.ts       # Health & provider status
│   ├── settings/page.tsx         # Standalone settings & memory manager
├── components/
│   ├── chat/
│   │   ├── Composer.tsx          # Drag-and-drop file upload tray & chips
│   │   ├── MessageItem.tsx       # Attachment previews & RAG source citations
│   │   └── ...
│   └── settings/
│       └── SettingsModal.tsx     # Memory viewer, inline editor, teach & file manager
├── services/
│   ├── ai/
│   │   ├── contextManager.ts     # Multi-layer context assembler (Memory + RAG + Summary)
│   │   └── providers/            # Pluggable LLM providers
│   ├── knowledge/
│   │   ├── extractor.ts          # Resilient parser for PDF, DOCX, XLSX, CSV, Code
│   │   └── knowledgeService.ts   # Semantic chunking & cosine-similarity RAG search
│   └── memory/
│       └── memoryService.ts      # Persistent memory, importance decay & auto-extraction
```

---

## Phase 3 Feature Matrix

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Multimodal Uploads** | Functional | PDF, DOCX, XLSX, CSV, TXT, MD, Code & Images with drag & drop |
| **Resilient Content Extraction** | Functional | Native `pdf-parse` v2 class, `mammoth`, `xlsx`, with ASCII fallback |
| **Semantic Chunking & RAG** | Functional | Sliding window chunking, BM25/keyword relevance scoring, source citations |
| **Long-Term Memory Engine** | Functional | Typed memories (facts, preferences, projects), importance scoring & decay |
| **User Memory Controls** | Functional | ON/OFF toggle, view memories, inline edit, delete individual/all, teach context |
| **Response Style Control** | Functional | Concise, Balanced, or Detailed persona tuning |
| **Real LLM Streaming** | Functional | Server-Sent Events (SSE) streaming live tokens from OpenAI |
| **Server-Side API Boundary** | Functional | `/api/chat` validates payloads, prunes context, and guards API keys |
| **Provider Abstraction** | Functional | Pluggable `IAIProvider` architecture (`OpenAIProvider`, ready for Gemini/Claude) |
| **Stop Generation** | Functional | Native `AbortController` cancellation preserving streamed partial tokens |
| **Safe Markdown & Code Blocks** | Functional | Headings, lists, tables, syntax highlighting with language badge and Copy button |
| **Smart Auto-Scroll** | Functional | Natural streaming scroll with user upward scroll lock & jump-to-bottom |

---

## Phase 4+ Roadmap

1. **Cloud Database & Vector Storage**: PostgreSQL / pgvector or Supabase integration.
2. **Real Authentication**: NextAuth.js / Supabase Auth with OAuth & session management.
3. **Voice & Audio**: Whisper speech-to-text input and natural text-to-speech voice playback.
4. **Live Web Search & Tool Calling**: External real-time search and tool execution.
