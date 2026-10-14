'use client';

import React, { useEffect, use } from 'react';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatNavbar } from '@/components/chat/ChatNavbar';
import { MessageList } from '@/components/chat/MessageList';
import { Composer } from '@/components/chat/Composer';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { AutomationModal } from '@/components/automation/AutomationModal';
import { useChat } from '@/features/chat/ChatContext';
import { Info } from 'lucide-react';

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { selectConversation, activeConversationId } = useChat();

  useEffect(() => {
    if (resolvedParams.id && resolvedParams.id !== activeConversationId) {
      selectConversation(resolvedParams.id);
    }
  }, [resolvedParams.id, activeConversationId, selectConversation]);

  return (
    <div className="chat-layout">
      <Sidebar />
      <main className="chat-main">
        <ChatNavbar />

        <MessageList />
        <Composer />
      </main>

      <SettingsModal />
      <AutomationModal />
    </div>
  );
}
